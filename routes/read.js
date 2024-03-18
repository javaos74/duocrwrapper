var express = require('express');
var router = express.Router();
var debug = require('debug')('http')
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const nconf = require('nconf')
const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");


const detect_angle = function( rotation) {
    let rot = rotation <0 ? 0 - rotation : 360 - rotation;
    if ( rot >= 360-45 || rot < 45)
        return 0;
    else if ( rot >= 45 || rot < 90+45)
        return 90;
    else if ( rot >= 90+45 || rot < 180-45)
        return 180;
    else 
        return 270;
}

nconf.file( {file: './routes/config.json'});

/* OCR Endpoint 기본 정보 */
router.get('/info/model', function(req,res,next) {
  const info = {
        accents:false,
        commit:"309c4703a92d41ca08d470955f0e253b416b151b",
        gpu:false,
        model:"du-ocr",
        rotation_detection:true,
        version:"1.0.0"
      }
  res.send( info);
});

async function post_and_get_from_read( res, path, endpoint, apiKey, hash ) {
    const modelId = 'prebuilt-read';

    const readStream = fs.createReadStream(path);

    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    const poller = await client.beginAnalyzeDocument(modelId, readStream, {
      onProgress: ({ status }) => {
        console.log(`status: ${status}`);
      },
    });

    const { documents, pages, tables } = await poller.pollUntilDone();
    for (const page of pages || []) {
        var du_resp = {
            responses: [
                {
                    angle: detect_angle( page.angle),
                    textAnnotations: [
                        {
                            description : '',
                            score: 0,
                            type: 'text',
                            image_hash: hash,
                            boundingPoly : {
                                vertices: [
                                    {x: 0, y: 0},
                                    {x: page.width, y: 0},
                                    {x: page.width, y: page.height},
                                    {x: 0, x: page.height},
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        var full_text = ''
        var min_conf = 1.0
        //text 
        page.words.forEach( w => {
            du_resp.responses[0].textAnnotations.push ( {
                description: w.content,
                score: w.confidence,
                type: 'text',
                boundingPoly: {
                    vertices: [
                        {x: w.polygon[0].x, y: w.polygon[0].y},
                        {x: w.polygon[1].x, y: w.polygon[1].y},
                        {x: w.polygon[2].x, y: w.polygon[2].y},
                        {x: w.polygon[3].x, y: w.polygon[3].y},
                    ]
                }
            });
            min_conf = Math.min(min_conf, w.confidence);
        });
        //full-text 
        page.lines.forEach( l => {
            full_text = full_text + l.content + '\r\n';
        });
        //전체 text 값을 제공하지 않아 words의 값을 전부 합함. 
        du_resp.responses[0].description = full_text;
        //평균 score 값을 계산 
        du_resp.responses[0].score = min_conf;
        res.send( du_resp);

        fs.unlink( path, (err2) => {
            if( err2)
                console.error('error on file deletion ');
        });
    }
}

/* POST body listing. */
router.post('/', function(req, res, next) {
    const READ_endpoint = process.env.MSREAD_ENDPOINT || nconf.get("read:endpoint");
    res.writeContinue();
    var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
    let buff = Buffer.from( req.body.requests[0].image.content, "base64");
    var filename = uuid.v4();
    fs.writeFileSync( __dirname + '/' + filename+'.img', buff);


    post_and_get_from_read (res, __dirname + '/' + filename+'.img', READ_endpoint, req.headers['x-uipath-license'], hash);

});

module.exports = router;
