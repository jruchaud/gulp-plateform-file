"use strict";

var through = require("through2");
var path = require("path");
var fs = require("fs");
var _ = require("lodash");
var util = require('gulp-util');

var getTokens = function(fileName) {
    return _.compact(fileName.split(/[.-]/));
};

/**
 * Process a file base name to extract from it every tokens
 * matching one of the filtering tokens defined in the dimensions
 * @returns {Array of string} List of the tokens that hav been found within the dimensions
 */
var getFilteredTokens = function(fileName, dimensions) {
    var tokens = getTokens(fileName);

    // Remove the first token which corresponds to the fileBaseName
    // and the last token which corresponds to the extension
    tokens.shift();tokens.pop();

    // remove unknown tokens from the list
    return _.intersection(tokens, _.flattenDeep(dimensions));
};

/**
 * Determine if the given file is a root file or a derivation of a root file
 * which should be filtered according to the defined dimensions
 *
 * @param   {String} fileBaseName base name of a file
 * @param   {Array of Array of string}
 * @returns {Boolean} true if the file contains one more tokens defined within the dimensions
 */
var isFileDerivation = function(fileBaseName, dimensions) {
    console.log("---", fileBaseName);
    var t = getFilteredTokens(fileBaseName, dimensions);
    return !!t.length;
};

var computeScore = function(tokens, dimensions) {
    var rst = 0;

    for (var t of tokens) {
        for (var i = 0, l = dimensions.length; i < l; i++) {
            if (dimensions[i].indexOf(t) >= 0) {
                rst = rst | 1 << l-i;
            }
        }
    }

    return rst;
};

var isDerivatedFrom = function(fileName, fileBaseName, dimensions) {
    var allTokens = getTokens(fileName),
        filteredTokens = getFilteredTokens(fileName, dimensions),
        diff = _.difference(allTokens, filteredTokens);

    var baseNameTokens = getTokens(fileBaseName),
        filteredBaseNameTokens = getFilteredTokens(fileBaseName, dimensions),
        baseDiff = _.difference(baseNameTokens, filteredBaseNameTokens);

    return diff.length == baseDiff.length && filteredTokens || [];
};

/**
 * Try to find the best matching candidate associated to a file in the same directory of that file
 * according to the given filtering tokens.
 * @param   {String} dir   Directory in which we should search for a derivated file
 * @param   {String} fileBaseName   file name we should use as a base to look for derivated file
 * @param   {Array of array of string}   dimensions tokens defining every dimension
 * @param   {Array of strings}   tokens on which is processed the filtering
 * @returns {String or null} String if a candidate has been found, null
 */
var find = function(dir, fileBaseName, dimensions, filteringTokens) {
    var rst = path.join(dir, fileBaseName);

    // Retrieve potential candidates within the dir

    var candidates = fs.readdirSync(dir).filter(function(item) {
        return item.startsWith(fileBaseName.split(".")[0]); // remove extension
    });

    var bestScore = 0;
    for (var fileName of candidates) {

        var tokens = isDerivatedFrom(fileName, fileBaseName, dimensions);

        // Check how many tokens match the dimension filter
        var intersection = _.intersection(tokens, filteringTokens);
        var intersectionCount = intersection.length,
            tokensCount = tokens.length;

        if (tokensCount && intersectionCount === tokensCount) { // perfect match
            var score = computeScore(intersection, dimensions);
            if (score > bestScore) {
                bestScore = score;
                rst = path.join(dir, fileName);
            }
        }
    }

    if (bestScore) {
        console.log("Substituting", fileBaseName,">>>",rst);
    }

    return rst;
};

var getConf = function(dimensions) {
    var envOptions = _.compact(_.flattenDeep(_.values(util.env)));
    return _.intersection(envOptions, _.flattenDeep(dimensions));
};

var filter = function(tokens) {
    _dimensions.push(tokens);
    return this;
};

var _dimensions = [];
function platformify(filePath) {
    var outFiles = {};

    var transform = through.obj(function(file, encoding, cb) {

        var filteringTokens = getConf(_dimensions);

        var f = filePath || file.path,
            dir = path.dirname(f),
            base = path.basename(f);

        if (!isFileDerivation(base, _dimensions)) { // only process root files (not the platform dependant ones)

            var specificPath = find(dir, base, _dimensions, filteringTokens);

            fs.readFile(specificPath, function(err, data) {

                if (filePath) {
                    outFiles[specificPath] = data;

                } else {
                    file.contents = data;
                    outFiles[specificPath] = file;
                }

                cb();
            });
        } else {
            cb();
        }
    },
    function(cb) {
        for (var fileName in outFiles) {
            if (outFiles.hasOwnProperty(fileName)) {
                var file = outFiles[fileName];
                this.push(file);
            }
        }
        cb();
    });

    transform.filter = filter.bind(transform);
    return transform;
}

platformify.filter = filter.bind(platformify)
module.exports = platformify;
