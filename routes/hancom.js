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
            endpoint: nconf.get("hancom:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    console.log(req.body);
    if( req.body.synap && req.body.synap.endpoint )
    {
        nconf.set("hancom:endpoint", req.body.synap.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no hancom.endpoint ");
    }
});


/* POST body listing. */
router.post('/', function(req, res, next) {
    const hancom_endpoint = process.env.HANCOM_ENDPOINT || nconf.get("hancom:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    var filename = uuid.v4();

    const formdata = {
        key: req.headers['x-uipath-license'],
        request_id: filename,
        file_format: 'image',
        file_url: '',
        file_bytes: req.body.requests[0].image.content,
        file_upload: ''
    }
    const options = {
        url: hancom_endpoint,
        method: 'POST',
        formData: formdata,
    }

    request.post( options, function(err, resp) {
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
            console.log( hancom);
            return res.status(415).send( hancom.msg);
        }
        hancom = JSON.parse(resp.body);
        var min_score = 1.0;
        var du_resp = {
            responses: [
                {
                    angle: detect_angle(hancom.content.ocr_data[0].image_rotation), 
                    textAnnotations: [
                        {
                            description : hancom.content.ocr_data[0].page_text,
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : {
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: hancom.content.ocr_data[0].image_width, y: 0},
                                    {x: hancom.content.ocr_data[0].image_width, y: hancom.content.ocr_data[0].image_height},
                                    {x: 0, x: hancom.content.ocr_data[0].image_height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }

        hancom.content.ocr_data[0].words.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.text,
                score: p.score,
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
