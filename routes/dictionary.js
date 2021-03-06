var router = require('express').Router();
var mongojs = require('mongojs');
var objId = mongojs.ObjectId;

var config = require('../config');
var db = mongojs(config.dbUrl);

var getSpeech = require('../common/audio');
var storage = require('../common/storage');
var images = require('../common/images');
var examples = require('../common/examples');
var filter = require('../common/searchCriteria').searchFilter;

var Q = require('q');

router.get('/:category/:answered', function(req, res, next) {
  db.collection('dictionary').find(filter(res.locals.user, req.params.category), {_id:0}).toArray(function(err, data) {
    if(err) {
      throw err;
    } else {
      var words = data.filter(function(elem) {
        return req.params.answered === 'true' || elem.answered < 100;
      });
      res.send(words);
    }
  });
});

router.patch('/:category', function(req, res, next) {
  db.collection('dictionary').findOne({user: res.locals.user, category: req.params.category, word: req.body.word}, {_id:1, translation:1}, function(err, data) {
    if(err) {
      throw err;
    } else if(!data) {
      res.status(404).send({
        'success': false,
        'err': 'word doesn\'t exist'
      });
    } else {
      if(data.translation.indexOf(req.body.translation) === -1) {
        data.translation.push(req.body.translation);
        db.collection('dictionary').update({'_id': data._id}, {
          $set: {
            'translation': data.translation
          }
        }, function(err, result) {
          if(err) {
            throw err;
          } else {
            return res.status(200).json({
              'success': true
            });
          }
        });
      } else {
        return res.status(409).json({
          'success': false,
          'err': 'translation was already present'
        });
      }
    }
  });
});

router.post('/:category', function(req, res, next) {
  var word = {
    'word': req.body.word,
    'translation': req.body.translation
  };

  db.collection('dictionary').findOne({user: res.locals.user, category: req.params.category, word: req.body.word}, {_id:0}, function(err, data) {
    if(err) {
      throw err;
    } else if(data) {
      res.status(200).send(data);
    } else {
      var speech = storage.get(req.body.word, config.s3BucketName)
      .catch(function(err) {
        return getSpeech(req.body.word).then(function(audio) {
          return storage.upload(req.body.word, config.s3BucketName, audio);
        });
      });

      Q.allSettled([speech, images(req.body.word), examples(req.body.word)])
      .then(function(result) {
        var wordCard = {
          'word': req.body.word,
          'user': res.locals.user,
          'category': req.params.category,
          'translation': [req.body.translation],
          'answered': 1,
          'audioUrl': result[0].value,
          'imageUrl': result[1].value,
          'samples': result[2].value
        };
        db.collection('dictionary').insert(wordCard, function(err, data) {
          if(err) {
            throw err;
          } else {
            db.collection('user').update({'_id': objId(res.locals.user)}, {
              $push: {
                'activities': {
                  $each: ['Added new word <span class="activity-add-word">' + wordCard.word + '</span> to dictionary, category: <span class="activity-add-category">' + wordCard.category + '</span>'],
                  $position: 0,
                  $slice: 10
                }
              }
            }, function(err, data) {
              if(err) {
                throw err;
              }
            });
            res.send(wordCard);
          }
        });
      });
    }
  });
});

router.delete('/:category/:word/:translation', function(req, res, next) {
  db.collection('dictionary').findOne({user: res.locals.user, category: req.params.category, word: req.params.word}, {_id:1, translation: 1}, function(err, data) {
    if(err) {
      throw err;
    } else if(!data) {
      return res.status(404).json({
        'success': false,
        'err': 'Word isn\'t present in dictionary'
      });
    } else {
      var index = data.translation.indexOf(req.params.translation);
      if(index !== -1) {
        data.translation.splice(index, 1);
        db.collection('dictionary').update({'_id': data._id}, {
          $set: {
            'translation': data.translation
          }
        }, function(err, result) {
          if(err) {
            throw err;
          } else {
            return res.status(200).json({
              'success': true
            });
          }
        });
      } else {
        return res.status(400).json({
          'success': false,
          'err': 'Translation isn\'t bound with the word'
        });
      }
    }
  });
});

router.delete('/:category/:word', function(req, res, next) {
  db.collection('dictionary').remove({user: res.locals.user, category: req.params.category, word: req.params.word}, function(err, data) {
    if(err) {
      throw err;
    } else if(data) {
      res.status(200).json({
        'success': data.n > 0 ? true : false
      });
    } else {
      res.status(404).send({
        'success': false,
        'err': 'word doesn\'t exist'
      });
    }
  });
});

router.patch('/learned/:category/:word', function(req, res, next) {
  var searchFilter = filter(res.locals.user, req.params.category);
  searchFilter.word = req.params.word;
  db.collection('dictionary').findOne(searchFilter, {_id:1},
    function(err, data) {
      if(err) {
        throw err;
      } else if (data) {
        var points = req.body.game == 'quiz' ? 5 : 1;
        db.collection('dictionary').update({'_id': data._id, 'answered': {'$lt': 100}}, {
            '$inc': {
              'answered': points
            }
        }, function(err, data) {
          if(err) {
            throw err;
          } else {
            res.send({
              'answered': data.answered
            });
          }
        });
      } else {
        res.status(404).send({
          'success': false,
          'err': 'word doesn\'t exist'
        });
      }
  });
});

module.exports = router;
