var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const imsize = require('image-size')


/* OCR Endpoint 기본 정보 */
router.get('/info/model', function(req,res,next) {
    const info = {
            accents:false,
            commit:"309c4703a92d41ca08d470955f0e253b416b151b",
            gpu:true,
            model:"du-ocr",
            rotation_detection:false,
            version:"1.0.0"
        }
    res.send( info);
});


/* POST body listing. */
router.post('/', function(req, res, next) {
    const clova_endpoint = process.env.CLOVA_ENDPOINT || "https://412baztid8.apigw.ntruss.com/custom/v1/83/962db625f801e2f12fd4eb7ce08994255f56d8a27639ea5c30e23cac89b10a86/general";
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    //let buff = new Buffer( req.body.requests[0].image.content, "base64");
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    fs.writeFileSync( __dirname + '/' + filename+'.img', buff);

    const feature = imsize( __dirname + '/' + filename+'.img');

    const req_msg = {
        version: 'V2',
        requestId : filename,
        timestamp : Date.now(),
        lang: 'ko',
        images : [{
            name: filename,
            format: 'jpeg'
        }]
    }
    //multipart/form-data
    const formdata = {
        message : JSON.stringify(req_msg),
        file: fs.createReadStream( __dirname + '/'+ filename+'.img')
    }

    const options = {
        url: clova_endpoint,
        method: 'POST',
        formData: formdata,
        headers: {
            'X-OCR-SECRET': req.headers['x-uipath-license'],
            'Content-Type': 'multipart/form-data'
            }
    }

    fs.unlink( __dirname + '/' + filename+'.img', (err) => {
        if( err)
            console.error('error on file deletion ');
    });

    request.post( options, function(err, resp) {
        if( err) {
            console.log(err);
            return res.status(500).send("Unknow errors");
        }
        clova = JSON.parse(resp.body);
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        if( resp.statusCode != 200) {
            console.log( clova);
            return res.status(415).send("Unsupported Media Type or Not Acceptable ");
        }
        var score_sum = 0.0;
        var full_text = ''
        var du_resp = {
            responses: [
                {
                    angle: 0,
                    textAnnotations: [
                        {
                            description : '',
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : { // 응답값이 해당 내용이 없어 이미지의 크기정보를 이용해서 구성 
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: feature.width, y: 0},
                                    {x: feature.width, y: feature.height},
                                    {x: 0, x: feature.height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        clova.images[0].fields.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.inferText,
                score: p.inferConfidence,
                type: 'text',
                boundingPoly: p.boundingPoly //구성이 동일해서 그대로 사용 
            });
            score_sum += p.inferConfidence;
        })
        //평균 score 값을 계산 
        du_resp.responses[0].score = score_sum / du_resp.responses[0].textAnnotations.length;
        res.send( du_resp);
    });
});



module.exports = router;