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

/* OCR Endpoint */
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
        hancom2:  {
            endpoint: nconf.get("hancom2:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    //console.log(req.body);
    if( req.body.hancom2 && req.body.hancom2.endpoint )
    {
        nconf.set("hancom2:endpoint", req.body.hancom2.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no hancom2.endpoint ");
    }
});


/* POST body listing. */
router.post('/', function(req, res, next) {
    const hancom2_endpoint = process.env.HANCOM_ENDPOINT || nconf.get("hancom2:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    var filename = uuid.v4();
    var buff = Buffer.from( req.body.requests[0].image.content, "base64");
    fs.writeFileSync( __dirname + "/" + filename+".jpg", buff);

    const formdata = {
//        key: req.headers['x-uipath-license'],
        REQUEST_ID: filename,
        DATA_FORMAT: 'image',
	FILE_BYTE_64: '',
        FILE: fs.createReadStream( __dirname + '/'+ filename+'.jpg'),
	OPEN_API_NAME : 'TEXT_RECOGNITION',
        OPEN_API_OPTION_JSON_STR: '{}',
	RAW: '{"IMAGE_WIDTH": 0, "IMAGE_HEIGHT": 0, "IMAGE_RAW_DATA": "string", "IMAGE_TYPE": "RGB", "ADDITIONAL": {} }'
    }
    const options = {
        url: hancom2_endpoint,
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
        if( resp.statusCode == 422)
        {
            return res.status(401).send("Unauthorized");
        }
        else if( resp.statusCode == 500 || resp.statusCode == 502 || resp.statusCode == 503)
        {
            return res.status(500).send("Internal Server Error");
        }
        else if( resp.statusCode != 200) {
            console.log( resp);
            return res.status(415).send( resp.body);
        }
        hancom = JSON.parse(resp.body);
        var min_score = 1.0;
        var du_resp = {
            responses: [
                {
                    angle: detect_angle(hancom.RESULT[0][0].image_rotation), 
                    textAnnotations: [
                        {
                            description : hancom.RESULT[0][0].page_text,
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : {
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: hancom.RESULT[0][0].image_width, y: 0},
                                    {x: hancom.RESULT[0][0].image_width, y: hancom.RESULT[0][0].image_height},
                                    {x: 0, x: hancom.RESULT[0][0].image_height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        hancom.RESULT[0][0].words.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.text,
                score: undefined, //p.score,
                type: 'text',
                boundingPoly: {
                    vertices: [
                        {x: p.bbox[0], y: p.bbox[1]},
                        {x: p.bbox[2], y: p.bbox[3]},
                        {x: p.bbox[4], y: p.bbox[5]},
                        {x: p.bbox[6], y: p.bbox[7]}
                    ]
                }
            });
            min_score = Math.min( min_score, parseFloat(p.score));
        })
        //최소 score 값을 계산 
        du_resp.responses[0].score = min_score;
        res.send( du_resp);

    });
});

module.exports = router;
