'use strict';

const express = require('express');
const _ = require('underscore');
const Controller = require('./controller');

let uniqueWizardId = 0;

let wizard = function (steps, fields, wizardOptions) {
    // create a wizard router
    let app = express.Router();

    // prevent potentially conflicting session namespaces
    wizardOptions = wizardOptions || {};
    wizardOptions.name = wizardOptions.name || String(uniqueWizardId++);

    // process step options and merge with wizard options
    let processedSteps = _.mapObject(steps, (options, route) => {
        options = _.extend({
            route,
            params: '',
            controller: Controller,
            journeyName: 'default',
            entryPoint: false,
            checkSession: true,
            checkJourney: true,
            skip: false,
            noPost: false,
            editable: false,
            editSuffix: '/edit',
            editBackStep: 'confirm',
            allFields: fields
        }, wizardOptions, options);

        // convert field list to field definitions
        if (_.isArray(options.fields)) {
            options.fields = _.object(
                options.fields,
                _.map(options.fields, f => fields[f] || {} )
            );
        }

        return options;
    });

    // create a controller for each route
    _.each(processedSteps, (options, route) => {
        options.steps = processedSteps;

        // create a new controller instance
        let ControllerClass = options.controller;
        let controller = new ControllerClass(options);

        // build the controller's request handlers
        controller.requestHandler();

        // add the controller router to the wizard router at the step path
        if (options.editable) {
            app.all(route + options.params + options.editSuffix,
                controller.editing.bind(controller),
                controller.router
            );
        }

        app.all(route + options.params,
            controller.router
        );

    });

    return app;
};

wizard.Controller = Controller;
wizard.Error = Controller.Error;

module.exports = wizard;
