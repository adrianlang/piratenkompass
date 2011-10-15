var exports = module.exports = require('./underscore/underscore-min.js'),
    async = require('async'),
    lib = exports;

exports.mapValues = function (inp, mapper) {
    return exports.reduce(inp, function (obj, v, k) {
            obj[k] = mapper(v, k);
            return obj;
        }, {});
};

exports.flattenOnce = function (inp) {
    var _ret = [];
    return _ret.concat.apply(_ret, inp);
};

function o(a, b) {
    return function () {
        return a(b.apply(this, arguments));
    };
}

function not(a) {
    return !a;
}

function firstHandler(handlers, test_func) {
    var res = null;
    handlers.some(function () {
        res = test_func.apply(this, Array.slice(arguments));
        return res;
    });
    return res;
}

exports.o = o;
exports.not = not;

exports.ncb_withRes = function (cb_reshandler, ncb_continue) {
    return function (err, res) {
        if (typeof res !== 'undefined') {
            res = cb_reshandler(res);
        }
        ncb_continue(err, res);
    };
};

exports.ncb_withErr = function (cb_errhandler, ncb_continue) {
    return function (err, res) {
        if (typeof err === 'undefined' || err === null) {
            err = cb_errhandler(err);
        }
        ncb_continue(err, res);
    };
};

exports.iterativeParallel = function (taskhandler, ncb_finishhandler, start_state) {
    var expect = [], overall_res = [];

    function ncb_register_done(state, err, res) {
        if (err) {
            return ncb_finishhandler(err);
        }

        overall_res.push(res);
        expect = lib.without(expect, state);
        if (expect.length === 0) {
            return ncb_finishhandler(null, overall_res);
        }
    }

    function start_task(state) {
        expect.push(state);

        return taskhandler(state, start_task,
                           ncb_register_done.bind(null, state));
    }

    start_task(start_state);
};

exports.numForOutput = function (v) {
    return Number.prototype.toFixed.call(v, 2);
};

exports.numSort = function (list) {
    return list.sort(function (a, b) {
        return a < b ? -1 : (a > b ? 1 : 0);
    });
};

/**
 * An asynchronous forEach stopping after the first iterator call yielding a
 * result. Returns the result of the iterator (as res) or an array containing
 * all errors received (as err), if no iterator yielded a value.
 */
exports.untilValue = function (arr, iterator, ncb_callback) {
    var errs = [];
    return async.forEachSeries(arr, function (item, callback) {
        iterator(item, function (err, res) {
            if (res) {
                // Trigger series aborting
                callback(res);
            } else {
                if (err) {
                    errs.push(err);
                }
                callback();
            }
        });
    }, function (res) {
        if (res) {
            ncb_callback(null, res);
        } else {
            ncb_callback(errs);
        }
    });
};

exports.retry = function (fn, delay, retries, ncb_callback) {
    var last_err = null;

    ncb_callback = arguments[arguments.length - 1];
    if (typeof delay !== 'number') {
        delay = 1000;
    }
    if (typeof retries !== 'number') {
        retries = 5;
    }

    async.whilst(function () {
        return retries-- > 0;
    }, function (callback) {
        fn(function (err, res) {
            if (err) {
                last_err = err;
                setTimeout(callback, delay);
            } else {
                ncb_callback(null, res);
            }
        });
    }, function () {
        ncb_callback(last_err || 'Maximum number of retries reached');
    });

};

exports.simpleTime = function (str) {
    var val, match,
        mapping = [
            {unit: 's', amount:  1},
            {unit: 'm', amount: 60},
            {unit: 'h', amount: 60},
            {unit: 'd', amount: 24},
            {unit: 'w', amount:  7}
        ];
    if (typeof str === 'number') {
        return str;
    }
    match = str.match(/^(-?[\d.]+)(\w)?$/);
    val = parseFloat(match[1], 10);
    if (match[2]) {
        exports.some(mapping, function (v) {
            val *= v.amount;
            if (v.unit === match[2]) {
                return true;
            }
        });
    }
    return val;
}

exports.cached = function (val_producer, expiry) {
    var value = null,
        valid_until = null;

    if (typeof expiry === 'undefined') {
        expiry = '1d';
    }
    expiry = exports.simpleTime(expiry);

    return function (ncb_val_handler) {
        if (valid_until === null || valid_until < Date.now()) {
            val_producer(exports.ncb_withRes(function (res) {
                value = res;
                valid_until = Date.now() + expiry;
                return res;
            }, ncb_val_handler));
        } else {
            ncb_val_handler(null, value);
        }
    };
};
