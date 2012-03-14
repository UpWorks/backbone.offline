(function() {

  window.Offline = {
    localSync: function(method, model, options, store) {
      var resp;
      resp = (function() {
        switch (method) {
          case 'read':
            if (_.isUndefined(model.id)) {
              return store.findAll();
            } else {
              return store.find(model);
            }
            break;
          case 'create':
            return store.create(model, options);
          case 'update':
            return store.update(model, options);
          case 'delete':
            return store.destroy(model, options);
        }
      })();
      if (resp) {
        return options.success(resp);
      } else {
        return options.error('Record not found');
      }
    },
    sync: function(method, model, options) {
      var store, _ref;
      store = model.storage || ((_ref = model.collection) != null ? _ref.storage : void 0);
      if (store) {
        return Offline.localSync(method, model, options, store);
      } else {
        return Backbone.ajaxSync(method, model, options);
      }
    }
  };

  Backbone.ajaxSync = Backbone.sync;

  Backbone.sync = Offline.sync;

  Offline.Records = (function() {

    function Records(name) {
      var store;
      this.name = name;
      store = localStorage.getItem(this.name);
      this.values = (store && store.split(',')) || [];
    }

    Records.prototype.add = function(itemId) {
      if (!_.include(this.values, itemId.toString())) {
        this.values.push(itemId.toString());
      }
      return this.save();
    };

    Records.prototype.remove = function(itemId) {
      this.values = _.without(this.values, itemId.toString());
      return this.save();
    };

    Records.prototype.save = function() {
      return localStorage.setItem(this.name, this.values.join(','));
    };

    Records.prototype.reset = function() {
      return this.values = [];
    };

    return Records;

  })();

  Offline.Collection = (function() {

    function Collection(collection) {
      this.collection = collection;
    }

    Collection.prototype.dirty = function() {
      return this.collection.filter(function(item) {
        return item.get('dirty');
      });
    };

    Collection.prototype.get = function(sid) {
      return this.collection.find(function(item) {
        return item.get('sid') === sid;
      });
    };

    Collection.prototype.diff = function(response) {
      return _.difference(_.without(this.collection.pluck('sid'), 'new'), _.pluck(response, 'id'));
    };

    return Collection;

  })();

  Offline.Storage = (function() {

    function Storage(name, collection, options) {
      this.name = name;
      this.collection = collection;
      if (options == null) options = {};
      this.keys = options.keys || {};
      this.allRecords = new Offline.Records(this.name);
      this.destroyRecords = new Offline.Records("" + this.name + "-destroy");
      this.colWrapper = new Offline.Collection(this.collection);
    }

    Storage.prototype.create = function(model, options) {
      if (options == null) options = {};
      if (model.attributes) model = model.attributes;
      model.sid = model.sid || model.id || 'new';
      model.id = this.guid();
      if (!options.local) {
        model.updated_at = (new Date).toString();
        model.dirty = true;
      }
      return this.saveItem(model);
    };

    Storage.prototype.update = function(model, options) {
      if (options == null) options = {};
      if (!options.local) {
        model.set({
          updated_at: (new Date).toString(),
          dirty: true
        });
      }
      return this.saveItem(model);
    };

    Storage.prototype.destroy = function(model, options) {
      var sid;
      if (options == null) options = {};
      if (!(options.local || (sid = model.get('sid')) === 'new')) {
        this.destroyRecords.add(sid);
      }
      return this.removeItem(model);
    };

    Storage.prototype.find = function(model) {
      return JSON.parse(localStorage.getItem("" + this.name + "-" + model.id));
    };

    Storage.prototype.findAll = function() {
      var id, _i, _len, _ref, _results;
      _ref = this.allRecords.values;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
        _results.push(JSON.parse(localStorage.getItem("" + this.name + "-" + id)));
      }
      return _results;
    };

    Storage.prototype.prepare = function() {
      var _this = this;
      if (this.isEmpty()) {
        return this.fullSync({
          success: function() {
            return _this.collection.fetch();
          }
        });
      } else {
        return this.collection.fetch({
          success: function() {
            return _this.incrementalSync();
          }
        });
      }
    };

    Storage.prototype.fullSync = function(options) {
      var _this = this;
      if (options == null) options = {};
      return Backbone.ajaxSync('read', this.collection, {
        success: function(response, status, xhr) {
          var item, _i, _len;
          _this.clear();
          localStorage.setItem(_this.name, '');
          _this.collection.reset([]);
          for (_i = 0, _len = response.length; _i < _len; _i++) {
            item = response[_i];
            _this.create(item, {
              local: true
            });
          }
          if (options.success) return options.success(response);
        }
      });
    };

    Storage.prototype.incrementalSync = function() {
      var _this = this;
      return this.pull({
        success: function() {
          return _this.push();
        }
      });
    };

    Storage.prototype.pull = function(options) {
      var _this = this;
      if (options == null) options = {};
      return Backbone.ajaxSync('read', this.collection, {
        success: function(response, status, xhr) {
          var item, sid, _i, _j, _len, _len2, _ref;
          _ref = _this.colWrapper.diff(response);
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            sid = _ref[_i];
            _this.removeBySid(sid);
          }
          for (_j = 0, _len2 = response.length; _j < _len2; _j++) {
            item = response[_j];
            _this.pullItem(item);
          }
          if (options.success) return options.success();
        }
      });
    };

    Storage.prototype.push = function() {
      var item, sid, _i, _j, _len, _len2, _ref, _ref2, _results;
      _ref = this.colWrapper.dirty();
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        item = _ref[_i];
        this.pushItem(item);
      }
      _ref2 = this.destroyRecords.values;
      _results = [];
      for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
        sid = _ref2[_j];
        _results.push(this.destroyBySid(sid));
      }
      return _results;
    };

    Storage.prototype.s4 = function() {
      return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };

    Storage.prototype.guid = function() {
      return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' + this.s4() + this.s4() + this.s4();
    };

    Storage.prototype.saveItem = function(item) {
      this.replaceKeyFields(item, 'local');
      localStorage.setItem("" + this.name + "-" + item.id, JSON.stringify(item));
      this.allRecords.add(item.id);
      return item;
    };

    Storage.prototype.removeItem = function(item) {
      localStorage.removeItem("" + this.name + "-" + item.id);
      this.allRecords.remove(item.id);
      return item;
    };

    Storage.prototype.replaceKeyFields = function(item, method) {
      var collection, field, model, newValue, replacedField, wrapper, _ref;
      model = item.attributes ? item.attributes : item;
      _ref = this.keys;
      for (field in _ref) {
        collection = _ref[field];
        replacedField = model[field];
        newValue = method === 'local' ? (wrapper = new Offline.Collection(collection), wrapper.get(replacedField).id) : collection.get(replacedField).get('sid');
        model[field] = newValue;
      }
      return model;
    };

    Storage.prototype.pushItem = function(item) {
      var localId, method, _ref,
        _this = this;
      this.replaceKeyFields(item, 'server');
      localId = item.id;
      _ref = item.get('sid') === 'new' ? ['create', null] : ['update', item.get('sid')], method = _ref[0], item.id = _ref[1];
      return Backbone.ajaxSync(method, item, {
        success: function(response, status, xhr) {
          item.id = localId;
          if (method === 'create') {
            item.set({
              sid: response.id
            });
          }
          return item.save({
            dirty: false
          }, {
            local: true
          });
        }
      });
    };

    Storage.prototype.destroyBySid = function(sid) {
      var fakeModel,
        _this = this;
      fakeModel = new Backbone.Model();
      fakeModel.id = sid;
      fakeModel.urlRoot = this.collection.url;
      return Backbone.ajaxSync('delete', fakeModel, {
        success: function(response, status, xhr) {
          return _this.destroyRecords.remove(sid);
        }
      });
    };

    Storage.prototype.isEmpty = function() {
      return localStorage.getItem(this.name) === null;
    };

    Storage.prototype.clear = function() {
      var collectionKeys, key, keys, _i, _len,
        _this = this;
      keys = Object.keys(localStorage);
      collectionKeys = _.filter(keys, function(key) {
        return (new RegExp(_this.name)).test(key);
      });
      for (_i = 0, _len = collectionKeys.length; _i < _len; _i++) {
        key = collectionKeys[_i];
        localStorage.removeItem(key);
      }
      this.allRecords.reset();
      return this.destroyRecords.reset();
    };

    Storage.prototype.removeBySid = function(sid) {
      var local;
      local = this.colWrapper.get(sid);
      return local.destroy({
        local: true
      });
    };

    Storage.prototype.pullItem = function(item) {
      var local;
      local = this.colWrapper.get(item.id);
      if (local) {
        return this.updateItem(local, item);
      } else {
        return this.createItem(item);
      }
    };

    Storage.prototype.updateItem = function(local, item) {
      if ((new Date(local.get('updated_at'))) < (new Date(item.updated_at))) {
        delete item.id;
        return local.save(item, {
          local: true
        });
      }
    };

    Storage.prototype.createItem = function(item) {
      if (!_.include(this.destroyRecords.values, item.id.toString())) {
        item.sid = item.id;
        delete item.id;
        return this.collection.create(item, {
          local: true
        });
      }
    };

    return Storage;

  })();

}).call(this);