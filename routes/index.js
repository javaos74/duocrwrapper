var express = require('express');
var router = express.Router();


router.get('/', function(req,res,next) {
    const info = {
            message: "choose one ocr engine: /clova for Naver Clova OCR Engine, /synap for Synapsoft OCR Engine",
            version: "1.0.0"
        }
    res.send( info);
});

router.get('/robot', function(req,res,next) {
	console.log(req);
	res.send("OK");
});

module.exports = router;
