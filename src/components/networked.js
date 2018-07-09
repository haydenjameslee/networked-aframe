/* global AFRAME, NAF */
var componentHelper = require('../ComponentHelper');
var Compressor = require('../Compressor');
var DEG2RAD = THREE.Math.DEG2RAD;

AFRAME.registerComponent('networked', {
  schema: {
    template: {default: ''},
    attachTemplateToLocal: { default: true },

    networkId: {default: ''},
    owner: {default: ''},
  },

  init: function() {
    this.OWNERSHIP_GAINED = 'ownership-gained';
    this.OWNERSHIP_CHANGED = 'ownership-changed';
    this.OWNERSHIP_LOST = 'ownership-lost';

    this.conversionEuler = new THREE.Euler();
    this.conversionEuler.order = "YXZ";
    this.positionComponents = [];
    this.scaleComponents = [];
    this.rotationComponents = [];

    var wasCreatedByNetwork = this.wasCreatedByNetwork();

    this.onConnected = this.onConnected.bind(this);
    this.onSyncAll = this.onSyncAll.bind(this);
    this.syncDirty = this.syncDirty.bind(this);
    this.networkUpdateHandler = this.networkUpdateHandler.bind(this);

    this.cachedData = {};
    this.initNetworkParent();

    if (this.data.networkId === '') {
      this.el.setAttribute(this.name, {networkId: NAF.utils.createNetworkId()});
    }

    if (wasCreatedByNetwork) {
      this.firstUpdate();
    } else {
      if (this.data.attachTemplateToLocal) {
        this.attachTemplateToLocal();
      }

      this.registerEntity(this.data.networkId);
    }

    this.lastOwnerTime = -1;

    if (NAF.clientId) {
      this.onConnected();
    } else {
      document.body.addEventListener('connected', this.onConnected, false);
    }

    document.body.dispatchEvent(this.entityCreatedEvent());
    this.el.dispatchEvent(new CustomEvent('instantiated', {detail: {el: this.el}}));
  },

  attachTemplateToLocal: function() {
    const template = NAF.schemas.getCachedTemplate(this.data.template);
    const elAttrs = template.attributes;

    // Merge root element attributes with this entity
    for (let attrIdx = 0; attrIdx < elAttrs.length; attrIdx++) {
      this.el.setAttribute(elAttrs[attrIdx].name, elAttrs[attrIdx].value);
    }

    // Append all child elements
    while (template.firstElementChild) {
      this.el.appendChild(template.firstElementChild);
    }
  },

  takeOwnership: function() {
    const owner = this.data.owner;
    const lastOwnerTime = this.lastOwnerTime;
    const now = NAF.connection.getServerTime();
    if (owner && !this.isMine() && lastOwnerTime < now) {
      this.lastOwnerTime = now;
      this.removeLerp();
      this.el.setAttribute('networked', { owner: NAF.clientId });
      this.syncAll();
      this.el.emit(this.OWNERSHIP_GAINED, { el: this.el, oldOwner: owner });
      this.el.emit(this.OWNERSHIP_CHANGED, { el: this.el, oldOwner: owner, newOwner: NAF.clientId});
      return true;
    }
    return false;
  },

  wasCreatedByNetwork: function() {
    return !!this.el.firstUpdateData;
  },

  initNetworkParent: function() {
    var parentEl = this.el.parentElement;
    if (parentEl.hasOwnProperty('components') && parentEl.components.hasOwnProperty('networked')) {
      this.parent = parentEl;
    } else {
      this.parent = null;
    }
  },

  registerEntity: function(networkId) {
    NAF.entities.registerEntity(networkId, this.el);
  },

  firstUpdate: function() {
    var entityData = this.el.firstUpdateData;
    this.networkUpdate(entityData);
  },

  onConnected: function() {
    if (this.data.owner === '') {
      this.lastOwnerTime = NAF.connection.getServerTime();
      this.el.setAttribute(this.name, {owner: NAF.clientId});
      setTimeout(() => {
        //a-primitives attach their components on the next frame; wait for components to be attached before calling syncAll
        this.syncAll();
      }, 0);
    }

    document.body.removeEventListener('connected', this.onConnected, false);
  },

  isMine: function() {
    return this.data.owner === NAF.clientId;
  },

  play: function() {
    this.bindEvents();
  },

  bindEvents: function() {
    var el = this.el;
    el.addEventListener('sync', this.syncDirty);
    el.addEventListener('syncAll', this.onSyncAll);
    el.addEventListener('networkUpdate', this.networkUpdateHandler);
  },

  pause: function() {
    this.unbindEvents();
  },

  unbindEvents: function() {
    var el = this.el;
    el.removeEventListener('sync', this.syncDirty);
    el.removeEventListener('syncAll', this.onSyncAll);
    el.removeEventListener('networkUpdate', this.networkUpdateHandler);
  },

  tick: function() {
    if (this.isMine() && this.needsToSync()) {
      this.syncDirty();
    }

    var now = Date.now();

    if (!this.isMine()) {
      for (var i = 0; i < this.positionComponents.length; i++) {
        var posComp = this.positionComponents[i];
        var progress = (now - posComp.lastUpdated) / posComp.duration;
        progress = progress > 1 ? 1 : progress;
        posComp.el.object3D.position.lerpVectors(posComp.start, posComp.target, progress);
      }

      for (var j = 0; j < this.rotationComponents.length; j++) {
        var rotComp = this.rotationComponents[j];
        var progress = (now - rotComp.lastUpdated) /rotComp.duration;
        progress = progress > 1 ? 1 : progress;
        THREE.Quaternion.slerp(rotComp.start, rotComp.target, rotComp.el.object3D.quaternion, progress);
      }

      for (var k = 0; k < this.scaleComponents.length; k++) {
        var scaleComp = this.scaleComponents[k];
        var progress = (now - scaleComp.lastUpdated) / scaleComp.duration;
        progress = progress > 1 ? 1 : progress;
        scaleComp.el.object3D.scale.lerpVectors(scaleComp.start, scaleComp.target, progress);
      }
    }
  },

  onSyncAll: function(e) {
    const { targetClientId } = e.detail;
    this.syncAll(targetClientId);
  },

  /* Sending updates */

  syncAll: function(targetClientId) {
    if (!this.canSync()) {
      return;
    }
    this.updateNextSyncTime();
    var syncedComps = this.getAllSyncedComponents();
    var components = componentHelper.gatherComponentsData(this.el, syncedComps);
    var syncData = this.createSyncData(components);
    // console.error('syncAll', syncData, NAF.clientId);
    if (targetClientId) {
      NAF.connection.sendDataGuaranteed(targetClientId, 'u', syncData);
    } else {
      NAF.connection.broadcastDataGuaranteed('u', syncData);
    }
    this.updateCache(components);
  },

  syncDirty: function() {
    if (!this.canSync()) {
      return;
    }
    this.updateNextSyncTime();
    var syncedComps = this.getAllSyncedComponents();
    var dirtyComps = componentHelper.findDirtyComponents(this.el, syncedComps, this.cachedData);
    if (dirtyComps.length == 0) {
      return;
    }
    var components = componentHelper.gatherComponentsData(this.el, dirtyComps);
    var syncData = this.createSyncData(components);
    if (NAF.options.compressSyncPackets) {
      syncData = Compressor.compressSyncData(syncData, syncedComps);
    }
    NAF.connection.broadcastData('u', syncData);
    // console.error('syncDirty', syncData, NAF.clientId);
    this.updateCache(components);
  },

  canSync: function() {
    return this.data.owner && this.isMine();
  },

  needsToSync: function() {
    return NAF.utils.now() >= this.nextSyncTime;
  },

  updateNextSyncTime: function() {
    this.nextSyncTime = NAF.utils.now() + 1000 / NAF.options.updateRate;
  },

  createSyncData: function(components) {
    var data = this.data;
    var sync = {
      0: 0, // 0 for not compressed
      networkId: data.networkId,
      owner: data.owner,
      lastOwnerTime: this.lastOwnerTime,
      template: data.template,
      parent: this.getParentId(),
      components: components
    };
    return sync;
  },

  getParentId: function() {
    this.initNetworkParent(); // TODO fix calling this each network tick
    if (!this.parent) {
      return null;
    }
    var netComp = this.parent.getAttribute('networked');
    return netComp.networkId;
  },

  getAllSyncedComponents: function() {
    return NAF.schemas.getComponents(this.data.template);
  },

  updateCache: function(components) {
    for (var name in components) {
      this.cachedData[name] = components[name];
    }
  },

  /* Receiving updates */

  networkUpdateHandler: function(received) {
    var entityData = received.detail.entityData;
    this.networkUpdate(entityData);
  },

  networkUpdate: function(entityData) {
    if (entityData[0] == 1) {
      entityData = Compressor.decompressSyncData(entityData, this.getAllSyncedComponents());
    }

    // Avoid updating components if the entity data received did not come from the current owner.
    if (entityData.lastOwnerTime < this.lastOwnerTime ||
          (this.lastOwnerTime === entityData.lastOwnerTime && this.data.owner > entityData.owner)) {
      return;
    }

    if (this.data.owner !== entityData.owner) {
      var wasMine = this.isMine();
      this.lastOwnerTime = entityData.lastOwnerTime;

      const oldOwner = this.data.owner;
      const newOwner = entityData.owner;
      if (wasMine) {
        this.el.emit(this.OWNERSHIP_LOST, { el: this.el, newOwner: newOwner });
      }
      this.el.emit(this.OWNERSHIP_CHANGED, { el: this.el, oldOwner: oldOwner, newOwner: newOwner});

      this.el.setAttribute('networked', { owner: entityData.owner });
    }
    this.updateComponents(entityData.components);
  },

  updateComponents: function(components) {
    var el = this.el;
    var syncedComponents = NAF.schemas.getComponents(this.data.template);

    for (var key in components) {
      if (this.isSyncableComponent(key)) {
        var data = components[key];
        if (NAF.utils.isChildSchemaKey(key)) {
          var schema = NAF.utils.keyToChildSchema(key);
          var childEl = schema.selector ? el.querySelector(schema.selector) : el;
          if (childEl) { // Is false when first called in init
            if (schema.property) {
              childEl.setAttribute(schema.component, schema.property, data);
            }
            else {
              var shouldLerp = this.shouldLerpComponent(syncedComponents, schema);
              this.updateComponent(childEl, schema.component, data, shouldLerp);
            }
          }
        } else {
          this.updateComponent(el, key, data, true);
        }
      }
    }
  },

  shouldLerpComponent: function(syncedComponents, schema) {
    for (var i = 0; i < syncedComponents.length; i++) {
      var syncedComponent = syncedComponents[i];

      // Lerp matching component unless lerp is explicitly set to false
      if (schema.selector === syncedComponent.selector && schema.component === syncedComponent.component) {
        return syncedComponent.lerp !== false;
      }
    }

    return false;
  },

  updateComponent: function (el, key, data, lerp) {
    if (!NAF.options.useLerp || !lerp) {
      return el.setAttribute(key, data);
    }

    switch(key) {
      case "position":
        var posComp = this.positionComponents.find((item) => item.el === el);

        if (!posComp) {
          posComp = {};
          posComp.el = el;
          posComp.start = new THREE.Vector3(data.x, data.y, data.z);
          posComp.target = new THREE.Vector3(data.x, data.y, data.z);
          posComp.lastUpdated = Date.now();
          posComp.duration = 1;
          this.positionComponents.push(posComp);
        } else {
          posComp.start.copy(posComp.target);
          posComp.target.set(data.x, data.y, data.z);
          var now = Date.now();
          posComp.duration = now - posComp.lastUpdated;
          posComp.lastUpdated = now;
        }
        break;
      case "rotation":
        var rotComp = this.rotationComponents.find((item) => item.el === el);

        if (!rotComp) {
          rotComp = {};
          rotComp.el = el;
          this.conversionEuler.set(DEG2RAD * data.x, DEG2RAD * data.y, DEG2RAD * data.z);
          rotComp.start = new THREE.Quaternion().setFromEuler(this.conversionEuler);
          rotComp.target = new THREE.Quaternion().setFromEuler(this.conversionEuler);
          rotComp.lastUpdated = Date.now();
          rotComp.duration = 1;
          this.rotationComponents.push(rotComp);
        } else {
          rotComp.start.copy(rotComp.target);
          this.conversionEuler.set(DEG2RAD * data.x, DEG2RAD * data.y, DEG2RAD * data.z);
          rotComp.target.setFromEuler(this.conversionEuler);
          var now = Date.now();
          rotComp.duration = now - rotComp.lastUpdated;
          rotComp.lastUpdated = now;
        }
        break;
      case "scale":
        var scaleComp = this.scaleComponents.find((item) => item.el === el);

        if (!scaleComp) {
          scaleComp = {};
          scaleComp.el = el;
          scaleComp.start = new THREE.Vector3(data.x, data.y, data.z);
          scaleComp.target = new THREE.Vector3(data.x, data.y, data.z);
          scaleComp.lastUpdated = Date.now();
          scaleComp.duration = 1;
          this.scaleComponents.push(scaleComp);
        } else {
          scaleComp.start.copy(scaleComp.target);
          scaleComp.target.set(data.x, data.y, data.z);
          var now = Date.now();
          scaleComp.duration = now - scaleComp.lastUpdated;
          scaleComp.lastUpdated = now;
        }
        break;
      default:
        el.setAttribute(key, data);
        break;
    }
  },

  removeLerp: function() {
    this.positionComponents = [];
    this.rotationComponents = [];
    this.scaleComponents = [];
  },

  isSyncableComponent: function(key) {
    if (NAF.utils.isChildSchemaKey(key)) {
      var schema = NAF.utils.keyToChildSchema(key);
      return this.hasThisChildSchema(schema);
    } else {
      return this.getAllSyncedComponents().indexOf(key) != -1;
    }
  },

  hasThisChildSchema: function(schema) {
    var schemaComponents = this.getAllSyncedComponents();
    for (var i in schemaComponents) {
      var localChildSchema = schemaComponents[i];
      if (NAF.utils.childSchemaEqual(localChildSchema, schema)) {
        return true;
      }
    }
    return false;
  },

  remove: function () {
    if (this.isMine() && NAF.connection.isConnected()) {
      var syncData = { networkId: this.data.networkId };
      NAF.connection.broadcastDataGuaranteed('r', syncData);
    }
    document.body.dispatchEvent(this.entityRemovedEvent(this.data.networkId));
  },

  entityCreatedEvent() {
    return new CustomEvent('entityCreated', {detail: {el: this.el}});
  },

  entityRemovedEvent(networkId) {
    return new CustomEvent('entityRemoved', {detail: {networkId: networkId}});
  }
});
