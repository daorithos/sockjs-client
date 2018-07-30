'use strict';

var EventEmitter = require('events').EventEmitter
    , inherits = require('inherits')
    , eventUtils = require('../../utils/event')
    , browser = require('../../utils/browser')
    , urlUtils = require('../../utils/url')
;

var debug = function () {
};
if (process.env.NODE_ENV !== 'production') {
    debug = require('debug')('sockjs-client:sender:xdr');
}

// References:
//   http://ajaxian.com/archives/100-line-ajax-wrapper
//   http://msdn.microsoft.com/en-us/library/cc288060(v=VS.85).aspx

function XDRObject(method, url, payload, sockJsOptions) {
    debug(method, url);
    var self = this;
    EventEmitter.call(this);

    setTimeout(function () {
        self._start(method, url, payload, sockJsOptions);
    }, 0);
}

inherits(XDRObject, EventEmitter);

XDRObject.prototype._start = function (method, url, payload, sockJsOptions) {
    debug('_start');
    var self = this;
    var xdr = new global.XDomainRequest();
    // IE caches even POSTs
    url = urlUtils.addQuery(url, 't=' + (+new Date()));

    xdr.onerror = function () {
        debug('onerror');
        self._error();
    };
    xdr.ontimeout = function () {
        debug('ontimeout');
        self._error();
    };
    xdr.onprogress = function () {
        debug('progress', xdr.responseText);
        self.emit('chunk', 200, xdr.responseText);
    };
    xdr.onload = function () {
        debug('load');
        self.emit('finish', 200, xdr.responseText);
        self._cleanup(false);
    };
    this.xdr = xdr;
    this.unloadRef = eventUtils.unloadAdd(function () {
        self._cleanup(true);
    });
    try {
        // Fails with AccessDenied if port number is bogus
        this.xdr.open(method, url);
        this.xdr._setHeader(sockJsOptions.headers);
        if (this.timeout) {
            this.xdr.timeout = this.timeout;
        }
        this.xdr.send(payload);
    } catch (x) {
        this._error();
    }
};

XDRObject.prototype._setHeader = function (headers) {
    if (headers) {
        for (var i in headers) {
            if (headers.hasOwnProperty(i)) {
                this.xdr.setRequestHeader(i, headers[i]);
            }
        }
    }
};

XDRObject.prototype._error = function () {
    this.emit('finish', 0, '');
    this._cleanup(false);
};

XDRObject.prototype._cleanup = function (abort) {
    debug('cleanup', abort);
    if (!this.xdr) {
        return;
    }
    this.removeAllListeners();
    eventUtils.unloadDel(this.unloadRef);

    this.xdr.ontimeout = this.xdr.onerror = this.xdr.onprogress = this.xdr.onload = null;
    if (abort) {
        try {
            this.xdr.abort();
        } catch (x) {
            // intentionally empty
        }
    }
    this.unloadRef = this.xdr = null;
};

XDRObject.prototype.close = function () {
    debug('close');
    this._cleanup(true);
};

// IE 8/9 if the request target uses the same scheme - #79
XDRObject.enabled = !!(global.XDomainRequest && browser.hasDomain());

module.exports = XDRObject;
