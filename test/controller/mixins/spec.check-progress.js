'use strict';

const baseController = require('../../helpers/controller');
const resolvePath = require('../../../lib/controller/mixins/resolve-path');
const checkProgress = require('../../../lib/controller/mixins/check-progress');

describe('mixins/check-progress', () => {

    let BaseController, StubController;
    let req, res, next, controller;

    beforeEach(() => {
        let options = {
            fields: {},
            allFields: {},
            checkJourney: true,
            name: 'wizard',
            route: '/teststep',
            template: 'template',
            next: 'nextstep'
        };

        req = request({
            form: { options },
            baseUrl: '/base'
        });
        res = response();
        next = sinon.stub();

        BaseController = baseController();
        BaseController = resolvePath(BaseController);
        StubController = checkProgress(BaseController);
        controller = new StubController(options);
    });

    it('should export a function', () => {
        checkProgress.should.be.a.function;
        checkProgress.length.should.equal(1);
    });

    it('should extend a passed controller', () => {
        controller.should.be.an.instanceOf(BaseController);
    });

    describe('middlewareChecks override', () => {
        it('calls the super method', () => {
            controller.middlewareChecks();
            BaseController.prototype.middlewareChecks.should.have.been.calledOnce;
        });

        it('uses the checkJourneyProgress middleware', () => {
            controller.middlewareChecks();
            BaseController.prototype.use.should.have.been.calledOnce;
            BaseController.prototype.use.should.have.been.calledWithExactly(
                controller.checkJourneyProgress
            );
        });
    });

    describe('checkJourneyProgress', () => {
        it('truncates journey history if reset session option is present', () => {
            controller.removeJourneyHistoryStep = sinon.stub();
            controller.options.reset = true;
            controller.checkJourneyProgress(req, res, next);
            controller.removeJourneyHistoryStep.should.have.been.calledWithExactly(req, res, '/base/teststep');
        });

        it('calls callback with MISSING_PREREQ error if there are no steps in history', () => {
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.args[0][0].should.be.an.instanceOf(Error);
            next.args[0][0].code.should.equal('MISSING_PREREQ');
            expect(next.args[0][0].redirect).to.be.undefined;
        });

        it('calls callback with MISSING_PREREQ error if this step isn\'t a nextstep in history', () => {
            req.journeyModel.set('history', [{
                path: '/previous/step',
                next: '/path/anotherstep'
            }]);
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.args[0][0].should.be.an.instanceOf(Error);
            next.args[0][0].code.should.equal('MISSING_PREREQ');
            next.args[0][0].redirect.should.equal('/path/anotherstep');
        });

        it('calls callback with MISSING_PREREQ error and redirect of last step if it has no next', () => {
            req.journeyModel.set('history', [{
                path: '/previous/step',
                next: null
            }]);
            controller.checkJourneyProgress(req, res, next);
            next.args[0][0].redirect.should.equal('/previous/step');
        });

        it('calls callback with no arguments if step is an entry point', () => {
            controller.options.entryPoint = true;
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.should.have.been.calledWithExactly();
        });

        it('calls callback with no arguments if journey checking is disabled', () => {
            controller.options.checkJourney = false;
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.should.have.been.calledWithExactly();
        });

        it('calls callback with no arguments if this step is a next step', () => {
            req.journeyModel.set('history', [{
                path: '/previous/step',
                next: '/base/teststep'
            }]);
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.should.have.been.calledWithExactly();
        });

        it('calls callback with MISSING_PREREQ if previous step is invalid', () => {
            req.journeyModel.set('history', [
                {
                    path: '/first/step',
                    next: '/previous/step'
                },
                {
                    path: '/previous/step',
                    next: '/base/teststep',
                    invalid: true
                }
            ]);
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.args[0][0].should.be.an.instanceOf(Error);
            next.args[0][0].code.should.equal('MISSING_PREREQ');
            next.args[0][0].redirect.should.equal('/previous/step');
        });

        it('calls callback with no arguments if a prereq is in the history', () => {
            controller.options.prereqs = [ '/allowed/step', '/previous/step' ];
            req.journeyModel.set('history', [{
                path: '/previous/step',
                next: '/base/anotherstep'
            }]);
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.should.have.been.calledWithExactly();
        });

        it('calls callback with no arguments if a relative prereq is in the history', () => {
            controller.options.prereqs = [ '/allowed/step', 'previous' ];
            req.journeyModel.set('history', [{
                path: '/base/previous',
                next: '/base/anotherstep'
            }]);
            controller.checkJourneyProgress(req, res, next);
            next.should.have.been.calledOnce;
            next.should.have.been.calledWithExactly();
        });
    });

    describe('setStepComplete', () => {
        beforeEach(() => {
            controller.addJourneyHistoryStep = sinon.stub();
            controller.getNextStepObject = sinon.stub().returns({
                url: 'nextstep',
                fields: ['field1', 'field2']
            });
        });

        it('adds step to history', () => {
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.should.have.been.calledWithExactly(
                req,
                res,
                sinon.match.object
            );
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: [ 'field1', 'field2' ],
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('adds custom path step to history if specified', () => {
            controller.setStepComplete(req, res, '/custom/route');
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/custom/route',
                    next: '/base/nextstep',
                    fields: [ 'field1', 'field2' ],
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('sets skip to true if skip option is true', () => {
            controller.options.skip = true;
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: [ 'field1', 'field2' ],
                    wizard: 'wizard',
                    skip: true,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('sets empty fields array if fields are empty', () => {
            controller.getNextStepObject.returns({
                url: 'nextstep'
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: undefined,
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('translates field names if a journeyKey is given', () => {
            req.form.options.allFields = {
                f1: {},
                f2: { journeyKey: 'j2' },
            };
            controller.getNextStepObject.returns({
                url: 'nextstep',
                fields: ['f1', 'f2', 'f3']
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: ['f1', 'j2', 'f3'],
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('appends step fields to form fields', () => {
            req.form.options.fields = {
                f1: {},
                f2: {},
                f3: {}
            };
            req.form.options.allFields = {
                f1: {},
                f2: { journeyKey: 'j2' },
                f3: { journeyKey: 'j3' },
                f4: {}
            };
            controller.getNextStepObject.returns({
                url: 'nextstep',
                fields: ['f1', 'f2', 'f4']
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: ['f1', 'j2', 'j3', 'f4'],
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

        it('sets minor if minor is set in step options', () => {
            req.form.options.minor = true;
            controller.getNextStepObject.returns({
                url: 'nextstep'
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: undefined,
                    wizard: 'wizard',
                    skip: undefined,
                    minor: true,
                    continueOnEdit: undefined
                }
            );
        });

        it('sets continueOnEdit if in editing mode and continueOnEdit is in condition', () => {
            req.isEditing = true;
            controller.getNextStepObject.returns({
                url: 'nextstep',
                condition: { continueOnEdit: true }
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: '/base/nextstep',
                    fields: undefined,
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: true
                }
            );
        });

        it('sets no next if decodeCondition returns null', () => {
            controller.getNextStepObject.returns({
                url: null
            });
            controller.setStepComplete(req, res);
            controller.addJourneyHistoryStep.args[0][2].should.deep.equal(
                {
                    path: '/base/teststep',
                    next: null,
                    fields: undefined,
                    wizard: 'wizard',
                    skip: undefined,
                    minor: undefined,
                    continueOnEdit: undefined
                }
            );
        });

    });

    describe('addJourneyHistoryStep', () => {
        it('creates a step history and adds step if there is no existing step history', () => {
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/newstep', next: '/path/newnext', newitem: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/newstep', next: '/path/newnext', newitem: true }
            ]);
        });

        it('appends step to end of existing history', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' }
            ]);
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/newstep', next: '/path/newnext', newitem: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/newstep', next: '/path/newnext', newitem: true }
            ]);
        });

        it('overwrites existing step with the same path', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' },
                { path: '/path/four', next: '/path/five' },
                { path: '/path/five', next: '/path/six' }
            ]);
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/three', next: '/path/four', newitem: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four', newitem: true },
                { path: '/path/four', next: '/path/five' },
                { path: '/path/five', next: '/path/six' }
            ]);
        });

        it('overwrites existing step and truncates if the next url is different', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' },
                { path: '/path/four', next: '/path/five' },
                { path: '/path/five', next: '/path/six' }
            ]);
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/three', next: '/path/newnext', newitem: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/newnext', newitem: true }
            ]);
        });

        it('overwrites step and marks old next as invalid if minor option is supplied', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' },
                { path: '/path/four', next: '/path/five' },
                { path: '/path/five', next: '/path/six' }
            ]);
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/three', next: '/path/newnext', minor: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/newnext', minor: true },
                { path: '/path/four', next: '/path/five', invalid: true },
                { path: '/path/five', next: '/path/six' }
            ]);
        });

        it('overwrites step if old next does not exist', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' }
            ]);
            controller.addJourneyHistoryStep(req, res,
                { path: '/path/three', next: '/path/newnext', minor: true }
            );
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/newnext', minor: true }
            ]);
        });
    });

    describe('invalidateJourneyHistoryStep', () => {
        it('invalidates a step in history', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' }
            ]);
            controller.invalidateJourneyHistoryStep(req, res, '/path/two');
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three', invalid: true },
                { path: '/path/three', next: '/path/four' }
            ]);
        });

        it('should do nothing if a matching history step is not found', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' }
            ]);
            controller.invalidateJourneyHistoryStep(req, res, '/path/seven');
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' }
            ]);
        });

        it('should do nothing if there is no step history', () => {
            controller.invalidateJourneyHistoryStep(req, res, '/path/seven');
            expect(req.journeyModel.get('history')).to.be.undefined;
        });
    });

    describe('removeJourneyHistoryStep', () => {
        it('truncates step history from a given step', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' },
                { path: '/path/three', next: '/path/four' }
            ]);
            controller.removeJourneyHistoryStep(req, res, '/path/two');
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' }
            ]);
        });

        it('should do nothing if a matching history step is not found', () => {
            req.journeyModel.set('history', [
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' }
            ]);
            controller.removeJourneyHistoryStep(req, res, '/path/seven');
            req.journeyModel.get('history').should.deep.equal([
                { path: '/path/one', next: '/path/two' },
                { path: '/path/two', next: '/path/three' }
            ]);
        });

        it('should do nothing if there is no step history', () => {
            controller.removeJourneyHistoryStep(req, res, '/path/seven');
            expect(req.journeyModel.get('history')).to.be.undefined;
        });
    });

});

