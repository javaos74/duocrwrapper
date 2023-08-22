var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const imsize = require('image-size')
const nconf = require('nconf');
nconf.file( './routes/config.json');

var hints = JSON.parse(fs.readFileSync("./routes/qanda_hints.json"))
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
        qanda : {
            endpoint: nconf.get("qanda:endpoint")
        }
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

router.put('/hints', function(req,res,next) {
    //console.log(req.body);
    if( req.body.hints )
    {
        hints = req.body;
        res.sendStatus(200);
    }
    else {
        res.status(404).send("no valid hints data");
    }
});

router.get('/hints', function(req, res, next) {
    res.send( hints);
});

/* POST body listing. */
router.post('/', function(req, res, next) {
    const qanda_endpoint = process.env.QANDA_ENDPOINT || nconf.get("qanda:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    //var filename = uuid.v4();
    //fs.writeFileSync( __dirname + '/' + filename + '.img', buff);
    //multipart/form-data
    var formdata = {
        image: buff //fs.createReadStream( __dirname + '/' + filename + '.img')
    }
    if( hints.hints && hints.hints.length > 0)
    {
        formdata['hints'] = JSON.stringify(hints.hints)
    }
    //Document Manager에서 호출 시 
    if( req.headers['traceparent']) 
    {
        formdata['context'] = req.headers['traceparent'];
    }

    const options = {
        url: qanda_endpoint,
        method: 'POST',
        formData: formdata
    }
    // Digitize Document 에서 호출 
    //console.log( req.body.requests[0].imageContext); { languageHints: [ 'auto' ] }
    //console.log( req.body.requests[0].features); [ { type: 'TextDetection' } ]
    //console.log( formdata.context, formdata.hints)
    request.post( options, function(err, resp) {
        if( err) {
            console.log(err);
            return res.status(500).send("Unknow errors");
        }
        //console.log( resp.body)
        qanda = JSON.parse(resp.body);
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        if( resp.statusCode != 200) {
            console.log( qanda);
            return res.status(415).send("Unsupported Media Type or Not Acceptable ");
        }
        var score_sum = 0.0;
        var du_resp = {
            responses: [
                {
                    angle: qanda.angle, // 나중에 skew값을 계산해서 업데이트 함 
                    textAnnotations: [
                        {
                            description : qanda.text,
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : { // 응답값이 해당 내용이 없어 이미지의 크기정보를 이용해서 구성 
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: qanda.width, y: 0},
                                    {x: qanda.width, y: qanda.height},
                                    {x: 0, y: qanda.height},
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
                description: p.text, //p.text.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318FA-Za-z0-9,\.\-]/gi,""),
                score: parseFloat(parseFloat(p.confidence).toFixed(3)),
                type: 'text',
                boundingPoly: { 
                    vertices: [
                        {x: p.points[0][0], y: p.points[0][1]},
                        {x: p.points[1][0], y: p.points[1][1]},
                        {x: p.points[2][0], y: p.points[2][1]},
                        {x: p.points[3][0], y: p.points[3][1]}
                    ]
                }
            });
            score_sum += parseFloat(parseFloat(p.confidence).toFixed(3));
        })
        //du_resp.responses[0].description = qanda.text;
        //평균 score 값을 계산 
        du_resp.responses[0].score = score_sum / du_resp.responses[0].textAnnotations.length;
        res.send( du_resp);

    });
});


module.exports = router;
