(function ($) {
  var deployPath = 'http://fe.ci.wonga.com:8080/job/Deploy%20to%20Drupal%20remote',
    unitTestPath = 'http://fe.ci.wonga.com:8080/job/Unit%20tests%20remote',
    buildPath = 'http://fe.ci.wonga.com:8080/job/Build%20Drupal',
    desktopServiceTestPath = 'http://fe.ci.wonga.com:8080/job/Service%20tests%20remote',
    mobileServiceTestPath = 'http://fe.ci.wonga.com:8080/job/Service%20tests%20remote%20-%20Mobile/';

  var getPendingBuildNumbers = function (response) {
    var pendingBuildNumbers = [],
      nextBuildNumber = response.nextBuildNumber - 1;

    for (var i = nextBuildNumber; i > nextBuildNumber - 8; --i) {
      pendingBuildNumbers.push(i);
    }

    return pendingBuildNumbers;
  };


  /**
   * Adds all the currently building jobs for a stage
   */
  var getPendingBuildObjects = function (stage, pendingBuilds) {
    var objects = {};

    var getPendingBuildObject = function (pendingBuildNumber) {
      var address = getJobUrl(stage, pendingBuildNumber);

      $.ajax({
        url: 'php/proxy.php',
        type: 'POST',
        dataType: 'json',
        data: {
          address: address
        },
        error: function (x, t, m) {
          if (t === "timeout") {
            console.log("Got timeout");
          } else {
            console.log(t);
          }
        },
        success: function (response) {
          var params = response.actions[0].parameters;
          if (typeof params !== "undefined") {
            var region = response.actions[0].parameters[1].value;
          }
          else {
            var region = response.actions[2].parameters[1].value;
          }

          if (typeof objects[region] == 'undefined' ||
            objects[region].number < response.number) {
            //Build

            setBoxSettings(stage, region, response, false)
            objects[region] = response;
          }
        }
      });
    }

    $.each(pendingBuilds, function (i, pendingBuildNumber) {
      getPendingBuildObject(pendingBuildNumber);
    })
  };

  var populateDashboard = function () {
    console.log('Getting updates');

    var build = buildPath + '/lastBuild/api/json?depth=1';
    var deploy = deployPath + '/api/json?depth=1';
    var unitTests = unitTestPath + '/api/json?depth=1';
    var desktopServiceTests = desktopServiceTestPath + '/api/json?depth=1';
    var mobileServiceTests = mobileServiceTestPath + '/api/json?depth=1';

    var deployData = getBuildingJobData(build, "build");
    var deployData = getJobData(deploy, "deploy");
    var unitTestsData = getJobData(unitTests, "unit");
    var desktopServiceTests = getJobData(desktopServiceTests, "service-desktop");
    var mobileServiceTests = getJobData(mobileServiceTests, "service-mobile");
  };

  function getJobData (address, stage) {
    $.ajax({
      url: 'php/proxy.php',
      type: 'POST',
      dataType: 'json',
      data: {
        address: address
      },
      error: function (x, t, m) {
        if (t === "timeout") {
          console.log("Got timeout");
        } else {
          console.log(t);
        }
      },
      success: function (response) {
        var pendingBuilds = getPendingBuildNumbers(response);
        getPendingBuildObjects(stage, pendingBuilds);
      }
    });
  }

  function getBuildingJobData (address, stage) {
    $.ajax({
      url: 'php/proxy.php',
      type: 'POST',
      dataType: 'json',
      data: {
        address: address
      },
      error: function (x, t, m) {
        if (t === "timeout") {
          console.log("Got timeout");
        } else {
          console.log(t);
        }
      },
      success: function (response) {
        setBoxSettings(stage, '', response, false);
      }
    });
  }

  /**
   * Builds url for a specific job and stage
   */
  function getJobUrl (stage, build) {
    var url = '';
    switch (stage) {
      case 'deploy':
        url += deployPath;
        break;
      case 'unit':
        url += unitTestPath;
        break;
      case 'service-desktop':
        url += desktopServiceTestPath;
        break;
      case 'service-mobile':
        url += mobileServiceTestPath;
        break;
    }
    url += '/' + build + '/api/json';

    return url;
  }

  /**
   * Builds a jQuery anchor element for a specific stage's build.
   *
   * @return {Object}
   *   Anchor html for the build.
   *
   */
  function getBuildUrl (stage, buildNumber, suffix) {
    if (!suffix) {
      suffix = '';
    }
    var path = '';
    switch (stage) {
      case 'build':
        path += buildPath;
        break;
      case 'deploy':
        path += deployPath;
        break;
      case 'unit':
        path += unitTestPath;
        break;
      case 'service-desktop':
        path += desktopServiceTestPath;
        break;
      case 'service-mobile':
        path += mobileServiceTestPath;
        break;
    }
    path += '/' + buildNumber;

    return '<a href="' + path + '" target="_blank">Build #'
      + buildNumber + suffix + '</a>';
  }

  //set the deploy box colours
  function setBoxSettings (stage, region, data, inQueue) {
    if (region != '') {
      region = '.' + region;
    }
    //have a default colour of red for the boxes
    var boxcolour = 'red';
    if (data.result == 'SUCCESS') {
      boxcolour = 'green';
    }
    else if (data.building === true) {
      boxcolour = 'yellow';
    }

    if (data.building === true && !isJobAlreadyBuilding(stage, region)) {
      updateProgressBar(stage, region, data);
    }
    else if (data.building !== true) {
      removeProgressBar(stage, region, data);
      setCompletedTime(stage, region, data.timestamp + data.duration, data.result);
      setRuntimeDuration(stage, region, data.duration, data.number);
    }


    //set the box classes for the colours
    $('.region' + region + ' .' + stage).removeClass('red green yellow pending');
    $('.region' + region + ' .' + stage).addClass(boxcolour);
    if (inQueue === true) {
      $('.region' + region + ' .' + stage).addClass('pending');
    }
  }

  function isJobAlreadyBuilding (stage, region) {
    return $('.region' + region + ' .' + stage).hasClass('yellow');
  }

  //set run time duration
  function setRuntimeDuration (stage, region, duration, build) {
    var seconds = duration / 1000;
    seconds = seconds.toFixed(0);
    var buildUrl = getBuildUrl(stage, build, ' - ' + seconds + ' seconds');
    $('.region' + region + ' .' + stage + ' .deploy-duration').html(buildUrl);
    $('.region' + region + ' .' + stage + ' .duration-stamp').html(duration);
  }

  function setCompletedTime (stage, region, timestamp, result) {
    var then = moment(timestamp);
    var symbol = '✘';
    if (result == 'SUCCESS') {
      symbol = '✔';
    }
    $('.region' + region + ' .' + stage + ' .deploy-time').html(symbol + ' ' + then.fromNow());
  }

  function updateProgressBar (stage, region, data) {
    var previousDuration = $('.region' + region + ' .' + stage + ' .duration-stamp').html();
    if (previousDuration.length > 0) {
      data.estimatedDuration = parseInt(previousDuration);
    }
    if ($('.region' + region + ' .' + stage + ' .progress').length) {
      //PROGRESS BAR EXISTS
      //update any progress time
      var completiontimestamp = $('.region' + region + ' .' + stage + ' .deploy-time').attr('completed');
      var completiontime = moment.unix(completiontimestamp);
      var buildUrl = getBuildUrl(stage, data.number, ' Done ' + completiontime.fromNow());
      $('.region' + region + ' .' + stage + ' .deploy-time').html(buildUrl);
    } else {
      //process bar doesn't exist - create it and start the animation
      $('.region' + region + ' .' + stage + ' .deploy-duration').after('<div class="progress progress-striped active"><div class="bar" style="width: 0%;"></div></div>');
      console.log(stage);
      console.log(region);
      console.log(data.estimatedDuration);
      $('.region' + region + ' .' + stage + ' .progress .bar').animate({width: '100%'}, data.estimatedDuration, 'linear');
      $('.region' + region + ' .' + stage + ' .deploy-duration').hide();

      if (!completiontime) {
        var completiontime = moment().add('milliseconds', data.estimatedDuration);
      }
      var buildUrl = getBuildUrl(stage, data.number, ' Done ' + completiontime.fromNow());
      $('.region' + region + ' .' + stage + ' .deploy-time').html(buildUrl);
      $('.region' + region + ' .' + stage + ' .deploy-time').attr('completed', completiontime.unix());
    }
  }

  function removeProgressBar (stage, region, data) {
    $('.region' + region + ' .' + stage + ' .progress').remove();
    $('.region' + region + ' .' + stage + ' .deploy-duration').fadeIn();
  }

  $(function() {
    populateDashboard();
    window.setInterval(populateDashboard, 10000);
  });
})(jQuery);


