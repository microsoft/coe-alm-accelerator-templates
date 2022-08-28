"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoeCliCommands = void 0;
const commander_1 = require("commander");
const login_1 = require("./login");
const alm_1 = require("./alm");
const devops_1 = require("./devops");
const run_1 = require("./run");
const cli_1 = require("./cli");
const ebook_1 = require("./ebook");
const winston = __importStar(require("winston"));
const fs = __importStar(require("fs"));
const path = require('path');
const environment_1 = require("../common/environment");
const marked = __importStar(require("marked"));
const readLineManagement_1 = require("../common/readLineManagement");
/**
 * Define supported commands across CoE Toolkit
 */
class CoeCliCommands {
    constructor(logger, defaultReadline = null, defaultFs = null) {
        if (typeof logger === "undefined") {
            this.logger = logger;
        }
        this.createLoginCommand = () => new login_1.LoginCommand(this.logger);
        this.createALMCommand = () => new alm_1.ALMCommand(this.logger);
        this.createDevOpsCommand = () => new devops_1.DevOpsCommand(this.logger);
        this.createRunCommand = () => new run_1.RunCommand(this.logger);
        this.createCliCommand = () => new cli_1.CLICommand(this.logger);
        this.createEBookCommand = () => new ebook_1.EbookCommand(this.logger);
        this.readline = defaultReadline;
        if (defaultFs == null) {
            this.readFile = fs.promises.readFile;
            this.writeFile = fs.promises.writeFile;
            this.existsSync = fs.existsSync;
        }
        else {
            this.readFile = defaultFs.readFile;
            this.writeFile = defaultFs.writeFile;
            this.existsSync = defaultFs.existsSync;
        }
        this.outputText = (text) => console.log(text);
        this._logOption = new commander_1.Option('-l, --log <log>', 'The log level').default(["info"]).choices(['error', 'warn', "info", "verbose", "debug"]);
    }
    /**
     * Parse commands from command line
     *
     * @param argv {string[]} - The command line to parse
     * @return {Promise} aync outcome
     *
     */
    async execute(argv) {
        const program = new commander_1.Command();
        program.version('0.0.1');
        this.AddHelpCommands(program);
        this.AddALMAcceleratorForMakerCommands(program);
        this.AddRunCommand(program);
        this.AddCliCommand(program);
        this.AddEbookCommand(program);
        await program
            .parseAsync(argv);
    }
    setupLogger(args) {
        if (typeof this.logger !== "undefined") {
            return;
        }
        let logLevel = "info";
        if (args.log === "string") {
            logLevel = args.log;
        }
        if (Array.isArray(args.log) && args.log.length > 0) {
            logLevel = args.log[0];
        }
        this.logger = winston.createLogger({
            format: winston.format.combine(winston.format.splat(), winston.format.simple()),
            transports: [new winston.transports.Console({ level: logLevel }),
                new winston.transports.File({
                    filename: 'combined.log',
                    level: 'verbose',
                    format: winston.format.combine(winston.format.timestamp({
                        format: 'YYYY-MM-DD hh:mm:ss A ZZ'
                    }), winston.format.json()),
                    handleExceptions: true
                })]
        });
    }
    AddHelpCommands(program) {
        var help = program.command('help')
            .description('Center of Excellence Command Line Interface Help');
        this.addHelpAction(help, 'help/readme.md');
        var alm = help.command('alm')
            .description("ALM Accelerator for Makers Help");
        this.addHelpAction(alm, "help/alm/readme.md");
        let almGenerate = alm.command('generate')
            .description("ALM Generate Help");
        this.addHelpAction(almGenerate, "help/alm/generate/readme.md");
        this.addHelpAction(almGenerate.command('install').description("ALM install help"), "help/alm/generate/install.md");
        let helpGenerateMaker = almGenerate.command('maker');
        this.addHelpAction(helpGenerateMaker.command('add').description("ALM Generate Maker Add help"), "help/alm/generate/maker/add.md");
        this.addHelpAction(alm.command('install')
            .description("ALM Install Help"), "help/alm/install.md");
        this.addHelpAction(alm.command('branch')
            .description("ALM Branch Help"), "help/alm/branch.md");
        let connection = alm.command('connection');
        this.addHelpAction(connection.command('add')
            .description("ALM Connection Add Help"), "help/alm/connection/add.md");
        let user = alm.command('user');
        this.addHelpAction(user.command('add')
            .description("ALM User Add Help"), "help/alm/user/add.md");
    }
    addHelpAction(command, filename) {
        command.action(async () => {
            this.outputMarkdown(await this.readFile(path.join(__dirname, '..', '..', '..', 'docs', filename), 'utf-8'));
        });
    }
    outputMarkdown(text) {
        var marked = require('marked');
        var TerminalRenderer = require('marked-terminal');
        marked.setOptions({
            // Define custom renderer
            renderer: new TerminalRenderer()
        });
        this.outputText(marked.marked(text));
    }
    AddALMAcceleratorForMakerCommands(program) {
        var alm = program.command('alm')
            .description('ALM Accelerator For Makers');
        let componentOption = new commander_1.Option('-c, --components <component>', 'The component(s) to install').default(["all"]).choices(['all', 'aad', 'devops', 'environment']);
        componentOption.variadic = true;
        let installOption = new commander_1.Option('-m, --importMethod <method>', 'The import method').default("api").choices(['browser', 'pac', 'api']);
        let installEndpoint = new commander_1.Option('--endpoint <name>', 'The endpoint').default("prod").choices(['prod', 'usgov', 'usgovhigh', 'dod', 'china', 'preview', 'tip1', 'tip2']);
        let createTypeOption = new commander_1.Option('-t, --type <type>', 'The service type to create').choices(['devops', 'development']);
        let subscriptionOption = new commander_1.Option('--subscription <subscription>', 'The Azure Active directory subscription (Optional select azure subscription if access to multiple subscriptions)');
        subscriptionOption.optional = true;
        let cloudOptions = new commander_1.Option("--cloud", "The Azure cloud to deploy to").default(["Public"])
            .choices(['Public',
            'USGov',
            'German',
            'China']);
        let regionOptions = new commander_1.Option("--region", "The region to deploy to").default(["NAM"])
            .choices(['NAM',
            'DEU',
            'SAM',
            'CAN',
            'EUR',
            'FRA',
            'APJ',
            'OCE',
            'JPN',
            'IND',
            'GCC',
            'GCC High',
            'GBR',
            'ZAF',
            'UAE',
            'GER',
            'CHE']);
        alm.command('create')
            .description('Create key services')
            .addOption(this._logOption)
            .addOption(createTypeOption)
            .action((options) => {
            this.setupLogger(options);
            let command = this.createALMCommand();
            command.create(options.type);
        });
        let generate = alm.command('generate');
        generate.command('install')
            .option('-o, --output <name>', 'The output file to generate')
            .addOption(this._logOption)
            .option('-s, --includeSchema <name>', 'Include schema', "true")
            .allowExcessArguments()
            .action(async (options) => {
            var _a, _b, _c, _d, _e;
            this.setupLogger(options);
            this.readline = readLineManagement_1.ReadLineManagement.setupReadLine(this.readline);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Generate Install start");
            let parse = {};
            let environments = new commander_1.Option("--installEnvironments", "The environments to setup connections and applications user permissions").default(['validation',
                'test',
                'prod'])
                .choices(['validation',
                'test',
                'prod']);
            const settings = new commander_1.Command()
                .command('settings');
            settings.addOption(environments);
            settings.option("--validation", "Validation Environment Name", "yourenvironment-validation");
            settings.option("--test", "Test Environment Name", "yourenvironment-test");
            settings.option("--prod", "Production Environment Name", "yourenvironment-prod");
            settings.option("--createSecret", "Create and Assign Secret values for Azure Active Directory Service Principal", "true");
            settings.option("--installFile", "The name of the ALM Accelerator managed solution file to import (Default: Download from latest GitHub release)");
            settings.option("--installSource", "The optional GitHub install source for ALM Accelerator", "coe");
            settings.option("--installAsset", "The optional GitHub ALM Accelerator install package name");
            settings.addOption(regionOptions);
            settings.addOption(cloudOptions);
            parse["environments"] = { parse: (text) => {
                    if ((text === null || text === void 0 ? void 0 : text.length) > 0 && text.indexOf('=') < 0) {
                        return text;
                    }
                    return this.parseSettings(text);
                },
                command: undefined };
            parse["settings"] = {
                parse: (text) => text,
                command: settings
            };
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Prompting for values");
            let results = await this.promptForValues(alm, 'install', ["devOpsOrganization", "environments"], ["file"], parse, 'help/alm/install.md');
            if (typeof results.settings === "string") {
                results.settings = this.parseSettings(results.settings);
            }
            if (typeof results.components === "string") {
                results.components = results.components.split(',');
            }
            if (typeof ((_c = results.settings) === null || _c === void 0 ? void 0 : _c.cloud) === "undefined") {
                if (typeof results.settings === "undefined") {
                    results.settings = {};
                }
                results.settings.cloud = "Public";
            }
            if (typeof ((_d = results.settings) === null || _d === void 0 ? void 0 : _d.region) === "undefined") {
                if (typeof results.settings === "undefined") {
                    results.settings = {};
                }
                // Set default region https://docs.microsoft.com/power-platform/admin/new-datacenter-regions
                results.settings.region = "NAM";
            }
            if (typeof options.output === "string") {
                if (options.includeSchema === "true") {
                    results["$schema"] = "./alm.schema.json";
                    let schemaFile = path.join(__dirname, '..', '..', '..', 'config', 'alm.schema.json');
                    this.writeFile(path.join(path.dirname(options.output), "alm.schema.json"), await this.readFile(schemaFile, { encoding: 'utf-8' }));
                }
                this.writeFile(options.output, JSON.stringify(results, null, 2));
            }
            else {
                this.outputText(JSON.stringify(results, null, 2));
            }
            this.readline.close();
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info("Generate Install end");
        });
        generate.command('maker')
            .command("add")
            .option('-o, --output <name>', 'The output file to generate')
            .addOption(this._logOption)
            .allowExcessArguments()
            .action(async (options) => {
            var _a, _b, _c, _d, _e;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Generate Maker start");
            let parse = {};
            const settings = new commander_1.Command()
                .command('settings');
            settings.option("--createSecret", "Create and Assign Secret values for Azure Active Directory Service Principal", "true");
            settings.addOption(cloudOptions);
            settings.addOption(regionOptions);
            parse["settings"] = {
                parse: (text) => text,
                command: settings
            };
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Prompting for values");
            let results = await this.promptForValues(maker, 'add', [], ["file"], parse, 'help/alm/maker/add.md');
            if (typeof results.settings === "string") {
                results.settings = this.parseSettings(results.settings);
            }
            if (typeof ((_c = results.settings) === null || _c === void 0 ? void 0 : _c.cloud) === "undefined") {
                if (typeof results.settings === "undefined") {
                    results.settings = {};
                }
                results.settings.cloud = "Public";
            }
            if (typeof ((_d = results.settings) === null || _d === void 0 ? void 0 : _d.region) === "undefined") {
                if (typeof results.settings === "undefined") {
                    results.settings = {};
                }
                // Set default region https://docs.microsoft.com/power-platform/admin/new-datacenter-regions
                results.settings.region = "NAM";
            }
            if (typeof options.output === "string") {
                this.writeFile(options.output, JSON.stringify(results, null, 2));
            }
            else {
                this.outputText(JSON.stringify(results, null, 2));
            }
            this.readline.close();
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info("Generate maker end");
        });
        let settingsOption = new commander_1.Option('-s, --settings <namevalues>', 'Optional settings');
        settingsOption.defaultValue = "createSecret=true";
        settingsOption.optional = true;
        let install = alm.command('install')
            .description('Initialize a new ALM Accelerator instance')
            .option('-f, --file <name>', 'The install configuration parameters file')
            .addOption(this._logOption)
            .addOption(componentOption)
            .option('-a, --aad <name>', 'The azure active directory service principal application. Will be created if not exists', 'ALMAcceleratorServicePrincipal')
            .option('-g, --group <name>', 'The azure active directory servicemaker group. Will be created if not exists', 'ALMAcceleratorForMakers')
            .option('-o, --devOpsOrganization <organization>', 'The Azure DevOps organization to install into')
            .option('-p, --project <name>', 'The Azure DevOps solution source code project name. Must already exist', 'alm-sandbox')
            .option('-r, --repository <name>', 'The Azure DevOps solution source code repository. Will be created if not exists', "alm-sandbox")
            .option('--pipelineProject <name>', 'The Azure DevOps pipeline project. Must already exist', 'alm-sandbox')
            .option('--pipelineRepository <name>', 'The Azure DevOps pipeline repository. Will be created if not exists', "pipelines")
            .option('-e, --environments <environments>', 'The Power Platform environment to install Managed solution to')
            .addOption(settingsOption)
            .addOption(installOption)
            .addOption(installEndpoint)
            .addOption(subscriptionOption);
        install.action(async (options) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Install start");
            let command = this.createALMCommand();
            let args = new alm_1.ALMInstallArguments();
            let settings = {};
            if (((_b = options.file) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("Loading configuration");
                let optionsFile = JSON.parse(await this.readFile(options.file, { encoding: 'utf-8' }));
                if (typeof optionsFile.log !== "undefined") {
                    this.logger = undefined;
                    this.setupLogger(optionsFile);
                }
                if (Array.isArray(optionsFile.environments)) {
                    optionsFile.environments = this.parseSettings(optionsFile.environments.join(','));
                    if (optionsFile.environments.length == 1) {
                        optionsFile.environment = optionsFile.environments[0];
                    }
                }
                if (typeof optionsFile.environments === "string") {
                    optionsFile.environments = this.parseSettings(optionsFile.environments);
                    optionsFile.environment = optionsFile.environments['0'];
                }
                if (typeof optionsFile.components === "string") {
                    options.components = optionsFile.components.split(',');
                }
                this.copyValues(optionsFile, args, {
                    "aad": "azureActiveDirectoryServicePrincipal",
                    "group": "azureActiveDirectoryMakersGroup",
                    "devOpsOrganization": "organizationName"
                });
                if (Array.isArray(optionsFile.level) && optionsFile.level.length > 0) {
                    for (var t = 0; t < this.logger.transports.length; t++) {
                        let transport = this.logger.transports[t];
                        transport.level = optionsFile.level[0];
                    }
                }
                settings = typeof optionsFile.settings === "string" ? this.parseSettings(optionsFile.settings) : optionsFile.settings;
            }
            else {
                args.components = options.components;
                args.subscription = options.subscription;
                args.azureActiveDirectoryServicePrincipal = options.aad;
                args.azureActiveDirectoryMakersGroup = options.group;
                args.organizationName = options.devOpsOrganization;
                args.project = options.project;
                args.repository = options.repository;
                args.pipelineProject = options.pipelineProject;
                args.pipelineRepository = options.pipelineRepository;
                if (((_d = options.environments) === null || _d === void 0 ? void 0 : _d.length) > 0 && ((_e = options.environments) === null || _e === void 0 ? void 0 : _e.indexOf('=')) > 0) {
                    args.environments = this.parseSettings(options.environments);
                    args.environment = '';
                }
                else {
                    args.environment = options.environments;
                }
                args.importMethod = options.importMethod;
                args.endpoint = options.endpoint;
                args.settings = this.parseSettings(options.settings);
            }
            args.createSecretIfNoExist = typeof settings == "undefined" || typeof settings["createSecret"] == "undefined" || ((_f = settings["createSecret"]) === null || _f === void 0 ? void 0 : _f.toLowerCase()) == "true";
            args.environments = environment_1.Environment.getEnvironments(args.environments, args.settings);
            (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info("Starting install");
            await command.install(args);
            (_h = this.logger) === null || _h === void 0 ? void 0 : _h.info("Install end");
        });
        let installOptions = install.options;
        for (let i = 0; i < installOptions.length; i++) {
            if (installOptions[i].name() == "subscription") {
                // subscription is optional unset required if it has been requested
                installOptions[i].required = false;
            }
        }
        let fix = alm.command('fix')
            .description('Attempt to fix install components');
        fix.command('build')
            .description('Attempt to build components')
            .option('-o, --devOpsOrganization <organization>', 'The Azure DevOps environment validate')
            .option('-p, --project <name>', 'The Azure DevOps name')
            .addOption(installEndpoint)
            .option('-r, --repository <name>', 'The Azure DevOps pipeline repository', "pipelines")
            .addOption(this._logOption).action(async (options) => {
            var _a, _b;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Build start");
            let login = this.createLoginCommand();
            let command = this.createDevOpsCommand();
            let args = new devops_1.DevOpsInstallArguments();
            args.organizationName = options.organization;
            args.projectName = options.project;
            args.repositoryName = options.repository;
            args.accessTokens = await login.azureLogin(["499b84ac-1321-427f-aa17-267ca6975798"]);
            args.endpoint = options.endpoint;
            await command.createMakersBuildPipelines(args, null, null);
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Build end");
        });
        let connection = alm.command('connection')
            .description('Manage connections');
        connection.command("add")
            .description("Add a new connection")
            .requiredOption('-o, --devOpsOrganization <name>', 'The Azure DevOps organization')
            .requiredOption('-p, --project <name>', 'The Azure DevOps project to add to', 'alm-sandbox')
            .requiredOption('-e, --environment <name>', 'The environment add conection to')
            .addOption(installEndpoint)
            .option('--aad <name>', 'The azure active directory service principal application', 'ALMAcceleratorServicePrincipal')
            .option('-u, --user <name>', 'The optional azure active directory user to assign to the connection')
            .option('-s, --settings <namevalues>', 'Optional settings')
            .addOption(this._logOption)
            .action(async (options) => {
            var _a, _b, _c;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Add start");
            let login = this.createLoginCommand();
            let command = this.createDevOpsCommand();
            let args = new devops_1.DevOpsInstallArguments();
            args.organizationName = options.devOpsOrganization;
            args.clientId = options.clientid;
            if (typeof options.aad !== "undefined") {
                args.azureActiveDirectoryServicePrincipal = options.aad;
            }
            args.projectName = options.project;
            args.environment = options.environment;
            args.clientId = options.clientid;
            args.accessTokens = await login.azureLogin(["499b84ac-1321-427f-aa17-267ca6975798"]);
            args.endpoint = options.endpoint;
            args.settings = this.parseSettings(options.settings);
            args.user = options.user;
            try {
                await command.createMakersServiceConnections(args, null, false);
            }
            catch (err) {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.error(err);
            }
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("Add end");
        });
        let maker = alm.command('maker')
            .description('Manage makers');
        maker.command("add")
            .option('-f, --file <name>', 'The install configuration parameters file from')
            .option('-o, --devOpsOrganization <name>', 'The Azure DevOps organization')
            .option('-p, --project <name>', 'The Azure DevOps project to add to', 'alm-sandbox')
            .option('-u, --user <name>', 'The user to add as a maker')
            .option('-e, --environment <organization>', 'The development environment to create the create service connection to for user')
            .option('-g, --group <name>', 'The azure active directory makers group to add user to.', 'ALMAcceleratorForMakers')
            .option('--aad <name>', 'The Azure Active Directory application to create service connection with', 'ALMAcceleratorServicePrincipal')
            .addOption(installEndpoint)
            .option('-s, --settings <namevalues>', 'Optional settings')
            .action(async (options) => {
            var _a, _b, _c, _d, _e;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Add start");
            let args = new alm_1.ALMMakerAddArguments();
            if (typeof options.file === "string" && ((_b = options.file) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("Loading configuration");
                let optionsFile = JSON.parse(await this.readFile(options.file, { encoding: 'utf-8' }));
                this.copyValues(optionsFile, args, {
                    "aad": "azureActiveDirectoryServicePrincipal",
                    "group": "azureActiveDirectoryMakersGroup",
                    "devOpsOrganization": "organizationName"
                });
            }
            else {
                args.user = options.user;
                args.organizationName = options.devOpsOrganization;
                args.project = options.project;
                args.azureActiveDirectoryServicePrincipal = options.aad;
                args.azureActiveDirectoryMakersGroup = options.group;
                args.endpoint = options.endpoint;
                args.environment = options.environment;
                args.settings = this.parseSettings(options.settings);
            }
            if (args.user.length == 0) {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("No user specified");
                return Promise.resolve();
            }
            let command = this.createALMCommand();
            await command.addMaker(args);
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info("Add end");
        });
        let user = alm.command('user')
            .description('Create Admin user in Dataverse Environment');
        user.command("add")
            .requiredOption('-e, --environment <organization>', 'The environment to create the user in')
            .option('-i, --id <id>', 'The unique identifier of the user')
            .option('--aad <name>', 'The azure active directory service principal application', 'ALMAcceleratorServicePrincipal')
            .option('-r, --role <name>', 'The user role', 'System Administrator')
            .option('-s, --settings <namevalues>', 'Optional settings')
            .addOption(this._logOption)
            .action(async (options) => {
            var _a, _b;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Add start");
            let command = this.createALMCommand();
            let args = new alm_1.ALMUserArguments();
            args.command = options.command;
            args.id = options.id;
            if (typeof options.aad !== "undefined") {
                args.azureActiveDirectoryServicePrincipal = options.aad;
            }
            args.environment = options.environment;
            args.role = options.role;
            args.settings = this.parseSettings(options.settings);
            await command.addUser(args);
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Add end");
        });
        alm.command('branch')
            .description('Create a new Application Branch')
            .requiredOption('-o, --devOpsOrganization <name>', 'The Azure DevOps Organization name')
            .requiredOption('-p, --project <name>', 'The Azure DevOps name')
            .option('-r, --repository <name>', 'The Azure DevOps name')
            .option('--pipelineProject <name>', 'The Azure DevOps pipelines project name')
            .option('--pipelineRepository <name>', 'The Azure DevOps pipelines temaples name', 'pipelines')
            .requiredOption('-d, --destination <name>', 'The branch to create')
            .option('--source <name>', 'The source branch to copy from')
            .option('--source-build <name>', 'The source build to copy from')
            .option('-s, --settings <namevalues>', 'Optional settings')
            .option('-a, --accessToken <name>', 'Access Token for Azure DevOps')
            .addOption(this._logOption)
            .action(async (options) => {
            var _a, _b;
            this.setupLogger(options);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Branch start");
            let args = new alm_1.ALMBranchArguments();
            args.organizationName = options.devOpsOrganization;
            args.repositoryName = options.repository;
            args.pipelineProject = options.pipelineProject;
            args.pipelineRepository = options.pipelineRepository;
            args.projectName = options.project;
            args.sourceBranch = options.source;
            args.sourceBuildName = options.sourceBuild;
            args.destinationBranch = options.destination;
            args.settings = this.parseSettings(options.settings);
            args.accessToken = options.accessToken;
            let command = this.createALMCommand();
            await command.branch(args);
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Branch end");
        });
        return alm;
    }
    AddRunCommand(program) {
        var run = program.command('run')
            .description('Run a set of commands')
            .option('-f, --file <filename>', 'The run configuration json file')
            .action(async (options) => {
            this.setupLogger(options);
            let args = new run_1.RunArguments();
            args.file = options.file;
            let command = this.createRunCommand();
            await command.execute(args);
        });
    }
    AddCliCommand(program) {
        let run = program.command('cli')
            .description('Manage the cli applicaton');
        run.command("about")
            .description('Open web page to discover more about CoE CLI')
            .action(async (options) => {
            this.setupLogger(options);
            let command = this.createCliCommand();
            await command.about();
        });
        run.command("add")
            .description('Add a new command to the cli application')
            .requiredOption('-n, --name <name>', 'The name of the new command to add')
            .action(async (options) => {
            this.setupLogger(options);
            let args = new cli_1.CLIArguments();
            args.name = options.name;
            let command = this.createCliCommand();
            await command.add(args);
        });
    }
    AddEbookCommand(program) {
        let ebook = program.command('ebook')
            .description('Manage the cli e-book');
        ebook.command("generate")
            .description('Generate e-book')
            .option('-d, --docs <docs path>', 'The documents folder name', 'docs')
            .option('-t, --tocLevel <elevl>', 'The toc level to generate', '3')
            .option('-h, --html <htmlfile>', 'The html file to create in docs folder', 'Power Platform CoE Toolkit Command Line Interface.html')
            .option('-r, --repo <name>', 'The repository where the docs are located', 'https://github.com/microsoft/coe-starter-kit/tree/main/coe-cli/docs')
            .addOption(this._logOption)
            .action(async (options) => {
            this.setupLogger(options);
            let command = this.createEBookCommand();
            let args = new ebook_1.EbookArguments();
            args.docsPath = options.docs;
            args.htmlFile = options.html;
            args.repoPath = options.repo;
            args.tocLevel = Number.parseInt(options.tocLevel);
            await command.create(args);
        });
    }
    parseSettings(setting) {
        let result = {};
        if ((setting === null || setting === void 0 ? void 0 : setting.length) > 0) {
            let arr = setting === null || setting === void 0 ? void 0 : setting.split(',');
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].indexOf('=') > -1) {
                    const keyVal = arr[i].split('=');
                    result[keyVal[0].toLowerCase()] = keyVal[1];
                }
                else {
                    result[i.toString()] = arr[i];
                }
            }
        }
        return result;
    }
    copyValues(source, destination, mappings) {
        let sourceKeys = Object.keys(source);
        let mappingKeys = Object.keys(mappings);
        for (let i = 0; i < sourceKeys.length; i++) {
            let newName = sourceKeys[i];
            let newMappedName = mappingKeys.filter(m => m == newName);
            newName = newMappedName.length == 1 ? mappings[newMappedName[0]] : newName;
            destination[newName] = source[sourceKeys[i]];
        }
    }
    async promptForValues(command, name, required, ignore, parse, helpFile = '') {
        let values = {};
        let match = command.commands.filter((c) => c.name() == name);
        let parseKeys = Object.keys(parse);
        if (match.length == 1) {
            let options = match[0].options;
            this.outputMarkdown(`NOTES:
1. To accept any default value just press **ENTER**
2. Unsure of what value is required respond with **?** then press **ENTER**`);
            this.outputText('');
            this.outputText(`Please provide your ${name} options`);
            for (var i = 0; i < options.length; i++) {
                let optionName = options[i].long.replace("--", "");
                if (ignore.includes(optionName)) {
                    continue;
                }
                let optionParseMatch = parseKeys.filter((p) => p == optionName);
                if (optionParseMatch.length == 1 && typeof parse[optionParseMatch[0]].command !== "undefined") {
                    let childOptions = parse[optionParseMatch[0]].command.options;
                    let childValues = {};
                    this.outputText(`> Which options for ${options[i].description}`);
                    for (var c = 0; c < childOptions.length; c++) {
                        await this.promptOption(helpFile, required, childOptions[c], childValues, parse, 2);
                    }
                    values[optionName] = childValues;
                }
                else {
                    await this.promptOption(helpFile, required, options[i], values, parse);
                }
            }
        }
        return values;
    }
    async promptOption(helpFile, required, option, data, parse, offset = 0) {
        return new Promise((resolve, reject) => {
            var _a, _b, _c;
            try {
                this.readline = readLineManagement_1.ReadLineManagement.setupReadLine(this.readline);
                if (((_a = option.argChoices) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                    let markdown = `Which choices for ${option.description}\r\n`;
                    for (let c = 0; c < option.argChoices.length; c++) {
                        markdown += `- **${c}**: ${option.argChoices[c]} \r\n`;
                    }
                    if (typeof option.defaultValue !== "undefined") {
                        markdown += `\r\nDefault value(s) **${option.defaultValue}**\r\n`;
                    }
                    this.outputMarkdown(markdown);
                    this.readline.question(`+ Your selection(s) seperated by commas for ${(_b = option.long) === null || _b === void 0 ? void 0 : _b.replace("--", "")}: `, async (answer) => {
                        var _a;
                        let optionName = option.name();
                        if ((answer === null || answer === void 0 ? void 0 : answer.length) > 0) {
                            if (answer == "?") {
                                await this.showHelp(helpFile, required, option, data, parse, offset);
                                resolve();
                                return;
                            }
                            let indexes = [];
                            let results = [];
                            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Received answer ${answer}`);
                            if (answer.split(',').length > 0) {
                                let indexParts = answer.split(',');
                                for (let n = 0; n < indexParts.length; n++) {
                                    indexes.push(Number.parseInt(indexParts[n]));
                                }
                            }
                            else {
                                indexes.push(Number.parseInt(answer));
                            }
                            for (let index = 0; index < indexes.length; index++) {
                                let indexValue = indexes[index];
                                if (indexValue >= 0 && indexValue < option.argChoices.length) {
                                    results.push(option.argChoices[indexValue]);
                                }
                            }
                            data[optionName] = results.join(',');
                            resolve();
                            return;
                        }
                        if ((answer === null || answer === void 0 ? void 0 : answer.length) == 0 && typeof option.defaultValue === "undefined" && (option.required || required.filter((r) => r == optionName).length == 1)) {
                            this.outputText("Required value.");
                            await this.promptOption(helpFile, required, option, data, parse, offset);
                            resolve();
                            return;
                        }
                        if (typeof option.defaultValue !== "undefined") {
                            let optionName = option.name();
                            data[optionName] = option.defaultValue;
                        }
                        resolve();
                    });
                }
                else {
                    let defaultText = '';
                    if (typeof option.defaultValue !== "undefined") {
                        defaultText = ` (Default ${option.defaultValue})`;
                    }
                    this.readline.question(`> ${option.description}${defaultText}: `, async (answer) => {
                        var _a;
                        let optionName = option.name();
                        if ((answer === null || answer === void 0 ? void 0 : answer.length) > 0) {
                            if (answer == "?") {
                                await this.showHelp(helpFile, required, option, data, parse, offset);
                                resolve();
                                return;
                            }
                            let parser = parse[optionName];
                            if (typeof parser !== "undefined") {
                                data[optionName] = parser.parse(answer);
                                resolve();
                                return;
                            }
                            if (((_a = option.flags) === null || _a === void 0 ? void 0 : _a.indexOf("[")) > 0 && answer.indexOf(',') > 0) {
                                data[optionName] = answer.split(',');
                            }
                            else {
                                data[optionName] = answer;
                            }
                            resolve();
                            return;
                        }
                        if ((answer === null || answer === void 0 ? void 0 : answer.length) == 0 && typeof option.defaultValue === "undefined" && (option.required || required.filter((r) => r == optionName).length == 1)) {
                            this.outputText("Required value.");
                            await this.promptOption(helpFile, required, option, data, parse, offset);
                            resolve();
                            return;
                        }
                        if (typeof option.defaultValue !== "undefined") {
                            data[optionName] = option.defaultValue;
                            resolve();
                            return;
                        }
                        resolve();
                    });
                }
            }
            catch (err) {
                console.log(err);
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.error(err);
                reject();
            }
        });
    }
    async showHelp(helpFile, required, option, data, parse, offset) {
        var _a, _b, _c;
        let markdownFile = path.normalize(path.join(__dirname, '..', '..', '..', 'docs', helpFile));
        let optionName = option.name();
        let foundCommand = false;
        let commandMarkdown = [];
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Searching for help ${optionName} in ${markdownFile}`);
        if (this.existsSync(markdownFile)) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Markdown help file found");
            let markdown = await this.readFile(markdownFile, 'utf-8');
            const tokens = marked.Lexer.lex(markdown);
            let inCommand = false;
            let commandDepth;
            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i].type == "heading") {
                    let heading = tokens[i];
                    if (!inCommand && heading.text.indexOf(optionName) >= 0) {
                        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Found command help`);
                        inCommand = true;
                        commandDepth = heading.depth;
                        foundCommand = true;
                        continue;
                    }
                    if (inCommand && heading.depth <= commandDepth) {
                        inCommand = false;
                    }
                }
                if (inCommand) {
                    commandMarkdown.push(tokens[i].raw);
                }
            }
        }
        if (!foundCommand) {
            this.outputText(`No further help for option ${optionName}`);
        }
        else {
            this.outputMarkdown(commandMarkdown.join("\r\n"));
        }
        await this.promptOption(helpFile, required, option, data, parse, offset);
    }
}
exports.CoeCliCommands = CoeCliCommands;
//# sourceMappingURL=commands.js.map