var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const imsize = require('image-size')
const nconf = require('nconf');

nconf.file( './routes/config.json');

const rot_val = [0, 270, 180, 90];
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
        upstage : {
            endpoint: nconf.get("upstage-dp:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    //console.log(req.body);
    if( req.body.upstage && req.body.upstage.endpoint )
    {
        nconf.set("upstage-dp:endpoint", req.body.upstage.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no upstage-dp.endpoint ");
    }
});

/* POST body listing. */
router.post('/', function(req, res, next) {
    var out_f = "text";
    const upstage_endpoint = process.env.UPSTAGE_ENDPOINT || nconf.get("upstage-dp:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    fs.writeFileSync( __dirname + '/' + filename+'.png', buff);
    const feature = imsize( buff); 
    if( 'f' in req.params)
        out_f = req.params['f']
    //multipart/form-data
    const formdata = {
        document: fs.createReadStream( __dirname + '/'+ filename+'.png'),
        ocr: 'force',
        output_formats: out_f == 'all' ? JSON.stringify([ "html", "markdown", "text"]) : JSON.stringify([ out_f])
    }

    const options = {
        url: upstage_endpoint,
        method: 'POST',
        formData: formdata,
        headers: {
            'Authorization': 'Bearer ' + req.headers['x-uipath-license']
            }
    }

    request.post( options, function(err, resp) {
        fs.unlink( __dirname + '/' + filename+'.png', (err2) => {
            if( err2)
                console.error('error on file deletion ');
        });
        if( err) {
            console.log(err);
            return res.status(500).send("Unknown error");
        }
        //console.log( resp);
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        else if( resp.statusCode == 500 || resp.statusCode == 502 || resp.statusCode == 503)
        {
            return res.status(500).send("Internal Server Error");
        }
        else if( resp.statusCode != 200) {
            return res.status(415).send("Unsupported Media Type or Not Acceptable");
        }
        upstage = JSON.parse(resp.body);
        var min_score = 1.0;
        var du_resp = {
            responses: [
                {
                    angle: 0, // 나중에 skew값을 계산해서 업데이트 함 
                    textAnnotations: [
                        {
                            description : upstage.content[out_f],
                            score: 0.0, //upstage.confidence,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : { // 응답값이 해당 내용이 없어 이미지의 크기정보를 이용해서 구성 
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: feature.width, y: 0},
                                    {x: feature.width, y: feature.height},
                                    {x: 0, y: feature.height}
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        var desc;
        var skew = [0,0,0,0];// { 0, 90, 180, 270 } 회전됨 문서
        var rotation_check_count = 20;
        upstage.elements.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.content[out_f],
                score: 0.0,
                type: 'text',
                boundingPoly: {
                    vertices: p.coordinates.map( c =>  { return { ...c, x: c.x * feature.width, y: c.y * feature.height}})//구성이 동일해서 그대로 사용 
                }
            });
            //min_score =  Math.min( min_score, p.confidence);
            if( rotation_check_count >= 0) {
                if( p.coordinates[0].x == p.coordinates[1].x &&
                    p.coordinates[1].y == p.coordinates[2].y && 
                    p.coordinates[2].x > p.coordinates[3].x )
                    skew[1]++;
                else if ( p.coordinates[0].y == p.coordinates[1].y && 
                    p.coordinates[1].x == p.coordinates[2].x &&
                    p.coordinates[1].x < p.coordinates[0].x )
                    skew[2]++;
                else if ( p.coordinates[0].x == p.coordinates[1].x && 
                    p.coordinates[1].y == p.coordinates[2].y && 
                    p.coordinates[2].x > p.coordinates[1].x )
                    skew[3]++;
                else
                    skew[0]++;
                rotation_check_count--;
            }
        })
        var max_idx = 0, max=0, idx=0;
        for( idx =0; idx < skew.length; idx++) {
            if( skew[idx] > max) {
                max = skew[idx];
                max_idx = idx;
            }
        }
        du_resp.responses[0].angle =  rot_val[max_idx];
        res.send( du_resp);
    });
});

module.exports = router;
