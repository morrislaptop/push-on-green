var Q = require('q');
var _ = require('lodash');
var request = require('request');
var exec = require('child_process').exec;
var notifier = require('node-notifier');
var program = require('commander');
var winston = require('winston');
var argv = require('minimist')(process.argv.slice(2));
winston.level = argv.v ? 'debug' : 'info';

program
    .version('0.0.1')
    .option('-v', 'Verbose debugging')
    .option('-w', 'Wait this seconds between checks (default 60)')
    .option('-d', 'Directory of drupalv3')
    .option('-b', 'Branch to push (default ed/master)')
    .option('-r', 'Name of remote (default edconolly)')
    .parse(process.argv);

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
        setTimeout(waitForGreenBoard, argv.w ? argv.w * 1000 : 60000);
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
   cwd: argv.d || '/Users/craigmorris/Sites/drupalv3'
};

waitForGreenBoard().then(function () {
    winston.info('All Green. Proceeding to push...');
    var branch = argv.b || 'ed/master';
    var remote = argv.r || 'edconolly';
    exec("git checkout " + branch + " && git pull --rebase && git push " + remote + " " + branch + ":master", options, puts);
});