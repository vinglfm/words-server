var router = require('express').Router();
var mongojs = require('mongojs');
var objId = mongojs.ObjectId;
var debug = require('debug')('words-server:category');

var config = require('../config');
var db = mongojs(config.dbUrl);

var storage = require('../common/storage');

var multer = require('multer');
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: 1
  }
});

var Q = require('q');

function create(req, res, initial, modifyCategories) {
  Q.fcall(function() {
    return initial;
  }).then(function(category) {

    if(req.files.length !== 0) {
      return storage.upload('category-' + res.locals.user + '-' + req.params.category, config.s3ImgBucket, req.files[0].buffer)
        .then(function(response) {
          initial.imageUrl = response;
          return initial;
        }).catch(function(err) {
          debug('Error occured while uploading category img, %s', err);
          return initial;
        });
    } else {
      return category;
    }
  }).then(function(category) {

    var categories = modifyCategories(category);
    db.collection('user').update({'_id': objId(res.locals.user)}, {
      $set: {
        'category': categories
      }
    }, function(err, result) {
      if(err) {
        throw err;
      } else {
        return res.status(200).json({
          'success': true,
          'category' : category
        });
      }
    });
  });
}

router.get('/', function(req, res, next) {
  db.collection('user').findOne({_id: objId(res.locals.user)}, {_id:0, category: 1}, function(err, data) {
    if(err) {
      throw err;
    } else {
      return res.send(data && data.category ? data.category : []);
    }
  });
});

router.post('/:category', upload.any(), function(req, res, next) {
  db.collection('user').findOne({'_id': objId(res.locals.user)}, {_id:1, category: 1}, function(err, data) {
    if(err) {
      throw err;
    } else if(!data) {
      return res.status(400).json({
        'success': false,
        'err': 'user wasn\'t found'
      });
    } else {
      if(!data.category) {
        data.category = [];
      }

      var index = data.category.findIndex(function(elem) {
        return elem.name === req.params.category;
      });

      if(index !== -1) {
        return res.status(409).json({
          'success': false,
          'err': 'category is already present'
        });
      } else {
        return create(req, res, {
          'name': req.params.category
        }, function(category) {
          data.category.push(category);
          return data.category;
        });
      }
    }
  });
});

router.put('/:category/:name', upload.any(), function(req, res, next) {
  db.collection('user').findOne({'_id': objId(res.locals.user)}, {_id:0, category: 1}, function(err, data) {
    if(err) {
      throw err;
    } else {
      if(!data.category) {
        data.category = [];
      }

      var index = data.category.findIndex(function(elem) {
        return elem.name === req.params.category;
      });

      if(index === -1) {
        return res.status(400).json({
          'success': false,
          'err': 'category doesn\'t exists'
        });
      } else {
        var duplicateIndex = data.category.findIndex(function(elem) {
          return elem.name === req.params.name;
        });
        if(duplicateIndex === -1 || duplicateIndex === index) {
          return create(req, res, {
            'name': req.params.name,
            'imageUrl': data.category[index].imageUrl
          }, function(category) {
            data.category[index] = category;
            return data.category;
          });
        } else {
          return res.status(409).json({
            'success': false,
            'err': 'category is already present'
          });
        }
      }
    }
  });
});

router.delete('/:category', function(req, res, next) {
  db.collection('user').update({_id: objId(res.locals.user)}, {$pull: {'category': {'name': req.params.category}}},
   function(err, data) {
    if(err) {
      throw err;
    } else {
      db.collection('dictionary').remove({user: res.locals.user, category: req.params.category}, function(err, data) {
        if(err) {
          debug('Error removing words user: %s, category: %s', res.locals.user, req.params.category);
        } else {
          debug('Remmoved %s words', data.n);
        }
      });
      res.status(200).json({
        'success': data.nModified > 0 ? true : false
      });
    }
  });
});

module.exports = router;
