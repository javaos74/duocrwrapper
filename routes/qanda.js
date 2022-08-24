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
        qanda : nconf.get("qanda:endpoint")
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    //console.log(req.body);
    if( req.body.clova && req.body.clova.endpoint )
    {
        nconf.set("qanda:endpoint", req.body.clova.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no qanda.endpoint ");
    }
});

/* POST body listing. */
router.post('/', function(req, res, next) {
    //const clova_endpoint = process.env.CLOVA_ENDPOINT || "https://412baztid8.apigw.ntruss.com/custom/v1/83/962db625f801e2f12fd4eb7ce08994255f56d8a27639ea5c30e23cac89b10a86/general";
    const clova_endpoint = process.env.CLOVA_ENDPOINT || nconf.get("qanda:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    //let buff = new Buffer( req.body.requests[0].image.content, "base64");
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    //multipart/form-data
    const formdata = {
        image: req.body.requests[0].image.content
    }

    const options = {
        url: qanda_endpoint,
        method: 'POST',
        formData: formdata,
        headers: {
            'Content-Type': 'multipart/form-data'
            }
    }

    request.post( options, function(err, resp) {
        if( err) {
            console.log(err);
            return res.status(500).send("Unknow errors");
        }
        qanda = JSON.parse(resp.body);
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        if( resp.statusCode != 200) {
            console.log( clova);
            return res.status(415).send("Unsupported Media Type or Not Acceptable ");
        }
        var score_sum = 0.0;
        var du_resp = {
            responses: [
                {
                    angle: 0, // 나중에 skew값을 계산해서 업데이트 함 
                    textAnnotations: [
                        {
                            description : '',
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : { // 응답값이 해당 내용이 없어 이미지의 크기정보를 이용해서 구성 
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: qanda.width, y: 0},
                                    {x: qanda.width, y: qanda.height},
                                    {x: 0, x: qanda.height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        var desc;
        var skew = [0,0,0,0];// { 0, 90, 180, 270 } 회전됨 문서
        qanda.word_boxes.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.text,
                score: p.confidence,
                type: p.type,
                boundingPoly: { 
                    vertices: p.points //구성이 동일해서 그대로 사용 
                }
            });
            score_sum += p.confidence;
        })
        du_resp.responses[0].description = qanda.text;
        //평균 score 값을 계산 
        du_resp.responses[0].score = score_sum / du_resp.responses[0].textAnnotations.length;
        res.send( du_resp);

    });
});


module.exports = router;
