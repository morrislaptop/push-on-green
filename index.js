console.log('Hello World');

var Q = require('q');
var _ = require('lodash');
var request = require('request');
var exec = require('child_process').exec;
var notifier = require('node-notifier');

var jobsToCheck = [
    'Deploy to Drupal remote',
    'Unit tests remote',
    'Service tests remote',
    'Service tests remote - Mobile'
];
var regions = [
    'CL_UK',
    'CL_PL',
    'SME_UK',
    'CL_CA',
    'PLT_UK',
    'CL_ZA'
];

/**
 * Runs a series of functions to determine if a job is green for all regions
 *
 * @param jobData
 */
function isJobGreen(jobData) {
    var flags = [!isJobInProgress(jobData), !hasJobFailed(jobData)];
    return flags.every(Boolean);
}

/**
 *  If the last 8 job numbers are NOT sequential then there is a build in progress
 *
 * @param jobData
 * @returns {boolean}
 */
function isJobInProgress(jobData) {
    var jobsToLookAt = 8;
    var lastJobNumber = jobData.builds[0].number;
    for (var i = 1; i < jobsToLookAt; i++) {
        // Check sequential job number
        var thisJobNumber = jobData.builds[i].number;
        if (thisJobNumber !== lastJobNumber - 1) {
            return true;
        }
        lastJobNumber = jobData.builds[i].number;
    }
    return false;
}

/**
 * Finds the latest job for each region and returns false if any region
 * doesn't have a SUCCESS build status.
 *
 * @param jobData
 */
function hasJobFailed(jobData) {
    for (var i = 0; i < regions.length; i++) {
        var region = regions[i];
        for (var j = 0; j < jobData.builds.length; j++) {
            var build = jobData.builds[j];
            if ( getRegion(build) == region ) {
                if ( 'SUCCESS' != build.result ) {
                    return true;
                }
                break;
            }
        }
    }
    return false;
}

function getRegion(build) {
    var params = build.actions[0].parameters;
    if (typeof params !== "undefined") {
        var region = build.actions[0].parameters[1].value;
    }
    else {
        var region = build.actions[2].parameters[1].value;
    }
    return region;
}

var jobPromises = _.map(jobsToCheck, function (job) {

    var deferred = Q.defer();

    (function checkBuildStatus() {
        var url = 'http://fe.ci.wonga.com:8080/job/' + encodeURIComponent(job) + '/api/json?depth=1';
        console.log('Checking ' + job);
        request(url, function (err, response, body) {
            if ( isJobGreen(JSON.parse(body)) ) {
                deferred.resolve();
                return;
            }

            console.log('Waiting for ' + job);
            setTimeout(checkBuildStatus, 60000);
        });
    })();

    return deferred.promise;
});

function puts(error, stdout, stderr) {
   notifier.notify({
      'title': 'Push on Green',
      'message': stdout || stderr || error
   });
}

var options = {
   cwd: '/Users/craigmorris/Sites/drupalv3'
};

Q.all(jobPromises).then(function () {
   console.log('All Green. Proceeding to push...');
   exec("git push edconolly ed/master:master", options, puts);
});