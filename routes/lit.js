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
        lit : {
            endpoint: nconf.get("lit:endpoint")
        }
    }
    res.send( cfg);
});

router.put('/config', function(req,res,next) {
    _changed = 0;
    if( req.body.lit && req.body.lit.endpoint )
    {
        nconf.set("lit:endpoint", req.body.lit.endpoint);
        nconf.save()
        _changed = 1;
        
    }
    if( _changed)
    {
        res.sendStatus(200);
    }
    else 
    {
        res.status(404).send("no lit.endpoint ");
    }
});

/* POST body listing. */
router.post('/', function(req, res, next) {
    const lit_endpoint = process.env.LIT_ENDPOINT || nconf.get("lit:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    const feature = imsize( buff); 
    fs.writeFileSync( __dirname + '/' + filename + '.' + feature.type, buff);
    //multipart/form-data
    const formdata = {
        file : fs.createReadStream( __dirname + '/'+ filename + '.' + feature.type)
    }

    const options = {
        url: lit_endpoint,
        method: 'POST',
        formData: formdata,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'multipart/form-data'
        }
    }

    request.post( options, function(err, resp) {
        fs.unlink( __dirname + '/' + filename + '.' + feature.type, (err2) => {
            if( err2)
                console.error('error on file deletion ');
        });
        if( err) {
            console.log(err);
            return res.status(500).send("Unknown error");
        } 
        
        lit = JSON.parse(resp.body);
        if( resp.statusCode == 401 || resp.statusCode == 402) 
        {
            return res.status(401).send("Unauthorized");
        }
        if( resp.statusCode != 200) {
            console.log( lit);
            return res.status(415).send("Unsupported Media Type or Not Acceptable ");
        }
        var min_score = 1.0;
        var full_text = ''
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
        lit.textAnnotations.forEach( p => {
            du_resp.responses[0].textAnnotations.push ({
                description: p.description,
                score: p.confidence,
                type: 'text',
                boundingPoly: p.boundingPoly //구성이 동일해서 그대로 사용 
            });
            desc += p.description;

            min_score =  Math.min( min_score, p.confidence);
        
            if( rotation_check_count >= 0) {
                if( p.boundingPoly.vertices[0].x == p.boundingPoly.vertices[1].x &&
                    p.boundingPoly.vertices[1].y == p.boundingPoly.vertices[2].y && 
                    p.boundingPoly.vertices[2].x > p.boundingPoly.vertices[3].x )
                    skew[1]++;
                else if ( p.boundingPoly.vertices[0].y == p.boundingPoly.vertices[1].y && 
                    p.boundingPoly.vertices[1].x == p.boundingPoly.vertices[2].x &&
                    p.boundingPoly.vertices[1].x < p.boundingPoly.vertices[0].x )
                    skew[2]++;
                else if ( p.boundingPoly.vertices[0].x == p.boundingPoly.vertices[1].x && 
                    p.boundingPoly.vertices[1].y == p.boundingPoly.vertices[2].y && 
                    p.boundingPoly.vertices[2].x > p.boundingPoly.vertices[1].x )
                    skew[3]++;
                else
                    skew[0]++;
                rotation_check_count--;
            }
        })
        var max_idx = 0, max=0, idx=0;
        for( idx =0; idx < skew.length; idx++)
        {
            if( skew[idx] > max) {
                max = skew[idx];
                max_idx = idx;
            }
        }
        du_resp.responses[0].description = desc;
        du_resp.responses[0].angle =  rot_val[max_idx];
        //가장 낮은 score 값을 사용 
        du_resp.responses[0].score = min_score;
        res.send( du_resp);
    });
});



module.exports = router;
