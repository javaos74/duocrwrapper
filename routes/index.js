var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request')
const uuid = require('uuid')
const crypto = require('crypto');

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
  const MSREAD_endpoint = process.env.MSREAD_ENDPOINT || "http://msread.koreacentral.cloudapp.azure.com:5000";
  res.writeContinue();
  var hash = crypto.createHash('md5').update( req.body.requests[0].image.content).digest('hex');  
  //let buff = new Buffer( req.body.requests[0].image.content, "base64");
  let buff = Buffer.from( req.body.requests[0].image.content, "base64");
  var filename = uuid.v4();
  fs.writeFileSync( __dirname + "/" + filename+".png", buff);

  const options = {
      url: MSREAD_endpoint +"/vision/v3.2/read/syncAnalyze",
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: fs.createReadStream( __dirname + '/'+ filename+'.png')
  }
  //TO-BE-REMOVED
  console.log( 'endpoint=' + MSREAD_endpoint );

  fs.unlink( __dirname + '/' + filename+'.png', (err) => {
      if( err)
          console.log('error on file deletion ');
  });

  request.post( options, function(err, resp) {
      if( err) {
          console.log(err);
          return res.status(500).send("Unknow errors");
      }
      msread = JSON.parse(resp.body);
      if( resp.statusCode == 401 || resp.statusCode == 402) 
      {
          return res.status(401).send("Unauthorized");
      }
      if( resp.statusCode != 200) {
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
          });
      });
      du_resp.responses[0].description = full_text;
      /*
      msread.result.block_boxes.forEach( p => {
          du_resp.responses[0].textAnnotations.push ({
              description: p[5],
              score: p[4],
              type: 'text',
              boundingPoly: {
                  vertices: [
                      {x: p[0][0], y: p[0][1]},
                      {x: p[1][0], y: p[1][1]},
                      {x: p[2][0], y: p[2][1]},
                      {x: p[3][0], y: p[3][1]}
                  ]
              }
          });
      })
      */

      res.send( du_resp);
  });
});

module.exports = router;
