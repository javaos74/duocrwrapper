var express = require('express');
var router = express.Router();
const fs = require('fs');


router.get('/', function(req,res,next) {
    const info = {
            message: "choose one ocr engine: /clova for Naver Clova OCR Engine, /synap for Synapsoft OCR Engine",
            version: "1.0.0"
        }
    res.send( info);
});

router.get('/robot', function(req,res,next) {
	console.error(req);

    fs.writeFile("./robot_request.json", JSON.stringify(req.headers), 'utf8', function (err) {
        if (err) {
            console.log("An error occured while writing JSON Object to File.");
            return console.log(err);
        }
     
        console.log("JSON file has been saved.");
    });
	res.send( JSON.stringify(req.headers));
});
router.get('/robot/odata/Settings', function(req,res,next) {
	console.error(req);

    fs.writeFile("./robot_settings.json", JSON.stringify(req.headers), 'utf8', function (err) {
        if (err) {
            console.log("An error occured while writing JSON Object to File.");
            return console.log(err);
        }
     
        console.log("JSON file has been saved.");
    });
	res.send( JSON.stringify(req.headers));
});
module.exports = router;
