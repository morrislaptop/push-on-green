console.log('Hello World');

var Q = require('q');
var exec = require('child_process').exec;

var p1 = Q.delay(1000);
var p2 = Q.delay(1000);
var p3 = Q.delay(2000);

function puts(error, stdout, stderr) {
   console.log(stdout)
}

var options = {
   cwd: '.'
};

Q.all([p1, p2, p3]).then(function () {
   console.log('Pushing the git');
   exec("git push", options, puts);
});