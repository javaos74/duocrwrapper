var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const nconf = require('nconf')

const detect_angle = function( rotation) {
    let rot = 360 - rotation;
    if ( rot >= 360-45 || rot < 45)
        return 0;
    else if ( rot >= 45 || rot < 90+45)
        return 90;
    else if ( rot >= 90+45 || rot < 180-45)
        return 180;
    else 
        return 270;
}

nconf.file({file: './routes/config.json'});

/* OCR Endpoint 기본 정보 */
router.get('/info/model', function(req,res,next) {
    const info = {
            accents:false,
            commit:"309c4703a92d41ca08d470955f0e253b416b151b",
            gpu:true,
            model:"du-ocr",
            rotation_detection:true,
            version:"1.0.0"
        }
    res.send( info);
});

router.get('/config', function(req,res,next) {
    const cfg = {
        synap :  {
            endpoint: nconf.get("synap:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    console.log(req.body);
    if( req.body.synap && req.body.synap.endpoint )
    {
        nconf.set("synap:endpoint", req.body.synap.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no synap.endpoint ");
    }
});


/* POST body listing. */
router.post('/', function(req, res, next) {
    //const synap_endpoint = process.env.SYNAP_ENDPOINT || "https://ailab.synap.co.kr/sdk/ocr";
    const synap_endpoint = process.env.SYNAP_ENDPOINT || nconf.get("synap:endpoint");
    const synap_boxes_type = process.env.SYNAP_BOXES_TYPE || "block";
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    fs.writeFileSync( __dirname + "/" + filename+".jpg", buff);

    const formdata = {
        api_key: req.headers['x-uipath-license'],
        type: 'upload',
        boxes_type: synap_boxes_type,
        image: fs.createReadStream( __dirname + '/'+ filename+'.jpg'),
        coord: 'origin',
        skew: 'image',
        langs: 'all',
        textout: 'true'
    }
    const options = {
        url: synap_endpoint,
        method: 'POST',
        formData: formdata,
    }


    request.post( options, function(err, resp) {
        
        fs.unlink( __dirname + '/' + filename + '.jpg', (err2) => {
            if( err2)
                console.error('error on file deletion ');
        });
        
        if( err) {
            console.log(err);
            return res.status(500).send("Unknown error");
        }
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        else if( resp.statusCode == 500 || resp.statusCode == 502 || resp.statusCode == 503)
        {
            return res.status(500).send("Internal Server Error");
        }
        else if( resp.statusCode != 200) {
            console.log( resp.body);
            return res.status(415).send("Unsupported Media Type or Not Acceptable ");
        }
        synap = JSON.parse(resp.body);
        var min_score = 1.0;
        var du_resp = {
            responses: [
                {
                    angle: detect_angle( synap.result.rotation),
                    textAnnotations: [
                        {
                            description : synap.result.full_text,
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : {
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: synap.result.width, y: 0},
                                    {x: synap.result.width, y: synap.result.height},
                                    {x: 0, x: synap.result.height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        let boxes;
        switch (synap_boxes_type) {
        case "raw":
            boxes = synap.result.boxes;
            break;
        case "block":
            boxes = synap.result.block_boxes;
            break;
        case "line":
            boxes = synap.result.line_boxes;
            break;
        default:
            return res.status(500).send("Unknown or unsupported boxes type: " + synap_boxes_type);
        }

        boxes.forEach( p => {
            //word 중에 : 에 있다면 
            let idxcol = p[5].indexOf(":");
            if( idxcol  > 0 && p[5].length-1 > idxcol) {
                //let wlen = p[5].length;
                let twordarr = [...p[5]];
                //console.log(twordarr);
                let wlen = twordarr.reduce( (acc,cur) => acc + (cur.codePointAt(0) > 255 ? 2:1), 0);
                //console.log(`multibyte word length : ${wlen}`)
                let multibytepos = [...p[5].substring(0,idxcol)].reduce( (acc, cur) => acc + (cur.codePointAt(0)> 255 ? 2:1), 0);
                //console.log(`multibyte left length : ${multibytepos}`)
                //let llen = ((idxcol+1) * Math.abs( p[0][0]-p[1][0]))/wlen; 
                let llen = ((multibytepos+1) * Math.abs( p[0][0]-p[1][0]))/wlen; 
                //console.log(`org: ${p[5]} >>>  ${p[5].substring(0, idxcol+1)}  <->  ${p[5].substring(idxcol+1)}`);
                //console.log(`left len: ${llen} ,right len:  ${Math.abs(p[1][0]-p[0][0])-llen}`);
                // : 기준 left (:포함)
                du_resp.responses[0].textAnnotations.push ({
                    description: p[5].substring(0, idxcol+1),
                    score: p[4],
                    type: 'text',
                    boundingPoly: {
                        vertices: [
                            {x: p[0][0], y: p[0][1]},
                            {x: p[0][0] + llen-2, y: p[1][1]},
                            {x: p[0][0] + llen-2, y: p[2][1]},
                            {x: p[3][0], y: p[3][1]}
                        ]
                    }
                });
                // : 기준 right (:제외)
                du_resp.responses[0].textAnnotations.push ({
                    description: p[5].substring(idxcol+1),
                    score: p[4],
                    type: 'text',
                    boundingPoly: {
                        vertices: [
                            {x: p[0][0] + llen + 2, y: p[0][1]},
                            {x: p[1][0], y: p[1][1]},
                            {x: p[2][0], y: p[2][1]},
                            {x: p[3][0] + llen + 2, y: p[3][1]}
                        ]
                    }
                }); 
            } else {
                du_resp.responses[0].textAnnotations.push ({
                    description: p[5],
                    score: p[4],
                    type: 'text',
                    boundingPoly: {
                        vertices: [
                            {x: p[0][0], y: p[0][1]},
                            {x: p[1][0], y: p[1][1]},
                            {x: p[2][0], y: p[2][1]},
                            {x: p[3][0], y: p[3][1]}
                        ]
                    }
                });
             }
            min_score =  Math.min( min_score, p[4]);
        })
        //가장 낮은 score 값을 계산 
        du_resp.responses[0].score = min_score;
        res.send( du_resp);

    });
});

module.exports = router;
