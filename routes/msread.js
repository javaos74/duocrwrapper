var express = require('express');
var router = express.Router();
var debug = require('debug')('http')
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');
const nconf = require('nconf')

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


/* POST body listing. */
router.post('/', function(req, res, next) {
  //const MSREAD_endpoint = process.env.MSREAD_ENDPOINT || "http://msread.koreacentral.cloudapp.azure.com:5000";
  const MSREAD_endpoint = process.env.MSREAD_ENDPOINT || nconf.get("msread:endpoint");
  res.writeContinue();
  var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
  //let buff = new Buffer( req.body.requests[0].image.content, "base64");
  let buff = Buffer.from( req.body.requests[0].image.content, "base64");

  const options = {
      url: MSREAD_endpoint +"/vision/v3.2/read/syncAnalyze",
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: buff 
  }

  request.post( options, function(err, resp) {
      if( err) {
          console.log(err);
          return res.status(500).send("Unknown errors");
      }
      msread = JSON.parse(resp.body);
      debug("MS READ response: " + msread);
      if( resp.statusCode == 401 || resp.statusCode == 402) 
      {
          return res.status(401).send("Unauthorized");
      }
      if( resp.statusCode != 200) {
        console.log( msread);
          return res.status(415).send("Unsupported Media Type or Not Acceptable ");
      }
      var du_resp = {
          responses: [
              {
                  angle: detect_angle( msread.analyzeResult.readResults[0].angle),
                  textAnnotations: [
                      {
                          description : '',
                          score: 0,
                          type: 'text',
                          image_hash: hash,
                          boundingPoly : {
                              vertices: [
                                  {x: 0, y: 0},
                                  {x: msread.analyzeResult.readResults[0].width, y: 0},
                                  {x: msread.analyzeResult.readResults[0].width, y: msread.analyzeResult.readResults[0].height},
                                  {x: 0, x: msread.analyzeResult.readResults[0].height},
                              ]
                          }
                      }
                  ]
              }
          ]
      }
      var full_text = ''
      var score_sum = 0.0
      //full-text 
      msread.analyzeResult.readResults[0].lines.forEach( l => {
          full_text += l.text + "\r\n";
          l.words.forEach( w => {
              du_resp.responses[0].textAnnotations.push ( {
                description: w.text,
                score: w.confidence,
                type: 'text',
                boundingPoly: {
                    vertices: [
                        {x: w.boundingBox[0], y: w.boundingBox[1]},
                        {x: w.boundingBox[2], y: w.boundingBox[3]},
                        {x: w.boundingBox[4], y: w.boundingBox[5]},
                        {x: w.boundingBox[6], y: w.boundingBox[7]},
                    ]
                }
              });
              score_sum += w.confidence;
          });
      });
      //전체 text 값을 제공하지 않아 words의 값을 전부 합함. 
      du_resp.responses[0].description = full_text;
      //평균 score 값을 계산 
      du_resp.responses[0].score = score_sum / du_resp.responses[0].textAnnotations.length;
      res.send( du_resp);
  });
});

module.exports = router;
