var router = require('express').Router();
var dbUrl = require('../config').dbUrl;
var random = require('../common/random');

var filter = require('../common/searchCriteria').searchFilter;
var mongojs = require('mongojs');
var db = mongojs(dbUrl);

router.get('/:category/:answered', function(req, res, next) {
  db.collection('dictionary').find(filter(res.locals.user, req.params.category), {_id:0, word:1, translation:1, answered:1}, {limit: 50}).toArray(function(err, data) {
    if(err) {
      return res.status(500).send({
        'success': false,
        'message': err
      });
    } else if(data.length === 0) {
      return res.status(204).send({
        'success': true,
        'message': 'Missing data'
      });
    } else {
      var questions = data.filter(function(elem) {
        return req.params.answered === 'true' || elem.answered < 100;
      }).map(function(elem, index) {
        var answer;
        if(data.length === 0 || random.bool()) {
          answer = elem.translation[random.range(0, elem.translation.length)];
        } else {
          var randomElem = data[random.range(0, data.length)];
          answer = randomElem.translation[random.range(0, randomElem.translation.length)];
        }

        return {
          'word': elem.word,
          'translation': elem.translation,
          'guess': answer
        };
      });
      return res.send(questions);
    }
  });
});

module.exports = router;
