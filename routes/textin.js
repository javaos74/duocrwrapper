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
        textin: {
            endpoint: nconf.get("textin:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    //console.log(req.body);
    if( req.body.textin && req.body.textin.endpoint )
    {
        nconf.set("textin:endpoint", req.body.textin.endpoint);
        nconf.save()
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no textin.endpoint ");
    }
});

/* POST body listing. */
router.post('/', function(req, res, next) {
    const textin_endpoint = process.env.TEXTIN_ENDPOINT || nconf.get("textin:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    fs.writeFileSync( __dirname + '/' + filename+'.png', buff);

    const options = {
        url: textin_endpoint,
        method: 'POST',
        body: fs.readFileSync( __dirname + '/'+ filename+'.png'),
        headers: {
            'x-ti-app-id': req.headers['x-uipath-license'].split(":")[0],
            'x-ti-secret-code' : req.headers['x-uipath-license'].split(":")[1],
            'Content-Type': 'application/octet-stream'
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
        if( resp.statusCode == 40101 || resp.statusCode == 40102) 
        {
            return res.status(401).send("Unauthorized");
        }
        if( resp.statusCode == 40103)
        {
            return res.status(403).send("The client IP address is not in the whitelist");
        }
        else if( resp.statusCode == 500 || resp.statusCode == 502 || resp.statusCode == 503)
        {
            return res.status(500).send("Internal Server Error");
        }
        else if( resp.statusCode != 200) {
            return res.status(415).send("Unsupported Media Type or Not Acceptable");
        }
        var min_score = 1.0;
        textin = JSON.parse(resp.body);
        var du_resp = {
            responses: [
                {
                    angle: textin.pages[0].angle, // 나중에 skew값을 계산해서 업데이트 함 
                    textAnnotations: [
                        {
                            description : "",//textin.pages[0].text,
                            score: 0.0, //textin.confidence,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : { // 응답값이 해당 내용이 없어 이미지의 크기정보를 이용해서 구성 
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: textin.pages[0].width, y: 0},
                                    {x: textin.pages[0].width, y: textin.pages[0].height},
                                    {x: 0, y: textin.pages[0].height}
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        var desc;
        textin.pages[0].lines.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.text,
                score: p.score,
                type: 'text',
                boundingPoly: {
                    vertices: [
                        {x: p.position[0], y: p.position[1]},
                        {x: p.position[2], y: p.position[3]},
                        {x: p.position[4], y: p.position[5]},
                        {x: p.position[6], y: p.position[7]},
                    ]
                }
            });
            desc += " " + p.text;
            min_score = Math.min( min_score, p.score);
        })
        du_resp.responses[0].description = desc;
        du_resp.responses[0].score = min_score;
        res.send( du_resp);
    });
});

module.exports = router;
