console.log('Hello World');

var Q = require('q');
var _ = require('lodash');
var request = require('request');
var exec = require('child_process').exec;
var notifier = require('node-notifier');
var winston = require('winston');
//winston.level = 'debug';

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
    var lastJobNumber = jobData.nextBuildNumber;
    for (var i = 0; i < jobsToLookAt; i++) {
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
    for (var i = 0; i < build.actions.length; i++) {
        var params = build.actions[i].parameters;
        if (typeof params !== "undefined") {
            return params[1].value;
        }
    }
    throw new Error('Region not found');
}

function waitForGreenBoard() {

    winston.verbose('-------------------');

    var jobPromises = Q.all(_.map(jobsToCheck, function (job) {
        var jobDeferred = Q.defer();
        var url = 'http://fe.ci.wonga.com:8080/job/' + encodeURIComponent(job) + '/api/json?depth=1';
        winston.verbose('Checking ' + job);
        request(url, function (err, response, body) {
            if (isJobGreen(JSON.parse(body))) {
                jobDeferred.resolve();
            }
            else {
                winston.info('Waiting for ' + job);
                jobDeferred.reject();
            }
        });
        return jobDeferred.promise;
    }));
    jobPromises.fail(function () {
        setTimeout(waitForGreenBoard, 10000);
    });

    return jobPromises;
}

function puts(error, stdout, stderr) {
   notifier.notify({
      'title': 'Push on Green',
      'message': stdout || stderr || error
   });
}

var options = {
   cwd: '/Users/craigmorris/Sites/drupalv3'
};

waitForGreenBoard().then(function () {
    winston.info('All Green. Proceeding to push...');
   exec("git checkout ed/master && git pull --rebase && git push edconolly ed/master:master", options, puts);
});