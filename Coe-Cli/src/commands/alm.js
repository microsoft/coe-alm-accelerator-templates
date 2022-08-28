"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALMCommand = exports.ALMMakerAddArguments = exports.ALMUserArguments = exports.ALMInstallArguments = exports.ALMBranchArguments = void 0;
const aad_1 = require("./aad");
const login_1 = require("./login");
const powerplatform_1 = require("./powerplatform");
const devops_1 = require("./devops");
const DynamicsWebApi = require("dynamics-web-api");
const child_process_1 = require("child_process");
const github_1 = require("./github");
const axios_1 = __importDefault(require("axios"));
const environment_1 = require("../common/environment");
/**
 * ALM Accelerator for Makers commands
 */
class ALMCommand {
    constructor(logger) {
        this.logger = logger;
        this.createAADCommand = () => new aad_1.AADCommand(this.logger);
        this.createLoginCommand = () => new login_1.LoginCommand(this.logger);
        this.createDynamicsWebApi = (config) => new DynamicsWebApi(config);
        this.createDevOpsCommand = () => new devops_1.DevOpsCommand(this.logger);
        this.createGitHubCommand = () => new github_1.GitHubCommand(this.logger);
        this.createPowerPlatformCommand = () => new powerplatform_1.PowerPlatformCommand(this.logger);
        this.runCommand = (command, displayOutput) => {
            if (displayOutput) {
                return (0, child_process_1.execSync)(command, { stdio: 'inherit', encoding: 'utf8' });
            }
            else {
                return (0, child_process_1.execSync)(command, { encoding: 'utf8' });
            }
        };
        this.getAxios = () => axios_1.default;
        this.getPowerAppsEndpoint = (endpoint) => {
            return new powerplatform_1.PowerPlatformCommand(undefined).mapEndpoint('powerapps', endpoint);
        };
        this.getBapEndpoint = (endpoint) => {
            return new powerplatform_1.PowerPlatformCommand(undefined).mapEndpoint('bap', endpoint);
        };
    }
    async create(type) {
        var _a, _b, _c, _d;
        switch (type.toLowerCase()) {
            case "development": {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("To create a community edition developer environment");
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("https://web.powerapps.com/community/signup");
                break;
            }
            case "devops": {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("You can start with 'Start Free' and login with your organization account");
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("https://azure.microsoft.com/services/devops/");
            }
        }
    }
    /**
     * Install the components required to run the ALM Accelerator for Makers
     * @param args {ALMInstallArguments} - The install parameters
     */
    async install(args) {
        var _a, _b, _c, _d, _e;
        try {
            this.logger.info(`Installing ${args.components} started`);
            args.accessTokens = await this.getAccessTokens(args);
            this.logger.info("Access tokens loaded");
            if (((_a = args.components) === null || _a === void 0 ? void 0 : _a.filter(a => a == "all" || a == "aad").length) > 0) {
                await this.installAADApplication(args);
            }
            if (((_b = args.components) === null || _b === void 0 ? void 0 : _b.filter(a => a == "all" || a == "devops").length) > 0) {
                await this.installDevOpsComponents(args);
            }
            if (((_c = args.components) === null || _c === void 0 ? void 0 : _c.filter(a => a == "all" || a == "environment").length) > 0) {
                await this.installPowerPlatformComponents(args);
            }
        }
        catch (error) {
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.error(error);
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.error(error.stack);
            throw error;
        }
    }
    /**
     * Create the service principal required to manage solutions between Azure DevOps and the Power Platform environments
     * @param args
     * @returns
     */
    async installAADApplication(args) {
        var _a;
        let aad = this.createAADCommand();
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Install AAD application");
        let install = new aad_1.AADAppInstallArguments();
        install.subscription = args.subscription;
        install.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
        install.azureActiveDirectoryMakersGroup = args.azureActiveDirectoryMakersGroup;
        install.accessTokens = args.accessTokens;
        install.endpoint = args.endpoint;
        install.settings = args.settings;
        await aad.installAADApplication(install);
        aad.installAADGroup(install);
    }
    async installDevOpsComponents(args) {
        var _a;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Install DevOps Components");
        let command = this.createDevOpsCommand();
        let devOpsInstall = new devops_1.DevOpsInstallArguments();
        devOpsInstall.organizationName = args.organizationName;
        devOpsInstall.projectName = args.project;
        devOpsInstall.repositoryName = args.repository;
        devOpsInstall.pipelineProjectName = args.pipelineProject;
        devOpsInstall.pipelineRepositoryName = args.pipelineRepository;
        devOpsInstall.accessTokens = args.accessTokens;
        devOpsInstall.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
        devOpsInstall.azureActiveDirectoryMakersGroup = args.azureActiveDirectoryMakersGroup;
        devOpsInstall.subscription = args.subscription;
        devOpsInstall.createSecretIfNoExist = args.createSecretIfNoExist;
        devOpsInstall.environment = args.environment;
        devOpsInstall.environments = args.environments;
        devOpsInstall.endpoint = args.endpoint;
        devOpsInstall.settings = args.settings;
        await command.install(devOpsInstall);
    }
    /**
     * Import the latest version of the ALM Accelerator For Power Platform managed solution
     * @param args
     */
    async installPowerPlatformComponents(args) {
        var _a, _b, _c, _d;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Install PowerPlatform Components");
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        let command = this.createPowerPlatformCommand();
        let importArgs = new powerplatform_1.PowerPlatformImportSolutionArguments();
        importArgs.accessToken = typeof args.accessTokens !== "undefined" ? args.accessTokens[environmentUrl] : undefined;
        importArgs.environment = typeof args.environment === "string" ? args.environment : args.environments["0"];
        importArgs.azureActiveDirectoryMakersGroup = args.azureActiveDirectoryMakersGroup;
        importArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
        importArgs.createSecret = args.createSecretIfNoExist;
        importArgs.settings = args.settings;
        importArgs.sourceLocation = ((_b = args.settings["installFile"]) === null || _b === void 0 ? void 0 : _b.length) > 0 ? args.settings["installFile"] : '';
        if (((_c = args.settings["installFile"]) === null || _c === void 0 ? void 0 : _c.length) > 0 && !args.settings["installFile"].startsWith("https://")) {
            importArgs.sourceLocation = args.settings["installFile"];
        }
        if (importArgs.sourceLocation == '' || args.settings["installFile"].startsWith("https://")) {
            let github = this.createGitHubCommand();
            let gitHubArguments = new github_1.GitHubReleaseArguments();
            gitHubArguments.type = 'coe';
            gitHubArguments.asset = 'CenterofExcellenceALMAccelerator';
            if (typeof args.settings['installSource'] === "string" && args.settings['installSource'].length > 0) {
                gitHubArguments.type = args.settings['installSource'];
            }
            if (typeof args.settings['installAsset'] === "string" && args.settings['installAsset'].length > 0) {
                gitHubArguments.asset = args.settings['installAsset'];
            }
            gitHubArguments.settings = args.settings;
            importArgs.sourceLocation = await github.getRelease(gitHubArguments, 'coe-starter-kit');
            importArgs.authorization = github.getAccessToken(gitHubArguments);
        }
        importArgs.importMethod = args.importMethod;
        importArgs.endpoint = args.endpoint;
        importArgs.accessTokens = args.accessTokens;
        let environments = [];
        if (((_d = args.environment) === null || _d === void 0 ? void 0 : _d.length) > 0) {
            environments.push(args.environment);
        }
        let environmentNames = Object.keys(args.environments);
        for (var i = 0; i < environmentNames.length; i++) {
            let name = args.environments[environmentNames[i]];
            if (environments.filter((e) => e == name).length == 0) {
                environments.push(name);
            }
        }
        for (var i = 0; i < environments.length; i++) {
            let userArgs = new ALMUserArguments();
            userArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
            userArgs.environment = environments[i];
            userArgs.settings = args.settings;
            await this.addUser(userArgs);
        }
        await command.importSolution(importArgs);
        let aadCommand = this.createAADCommand();
        let aadId = aadCommand.getAADApplication(args);
        await command.addAdminUser(aadId, args);
    }
    /**
     * Add maker to Azure DevOps with service connection and maker user AAD group
     * @param args
     */
    async addMaker(args) {
        let devOps = this.createDevOpsCommand();
        let install = new devops_1.DevOpsInstallArguments();
        install.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
        install.azureActiveDirectoryMakersGroup = args.azureActiveDirectoryMakersGroup;
        install.organizationName = args.organizationName;
        install.projectName = args.project;
        install.user = args.user;
        install.createSecretIfNoExist = typeof args.settings["createSecret"] === "undefined" || args.settings["createSecret"] != "false";
        install.accessTokens = await this.getAccessTokens(args);
        install.endpoint = args.endpoint;
        install.environment = args.environment;
        await devOps.createMakersServiceConnections(install, null, false);
        let aad = this.createAADCommand();
        aad.addUserToGroup(args.user, args.azureActiveDirectoryMakersGroup);
    }
    /**
     * Add Application user to Power Platform Dataverse environment
     *
     * @param args {ALMBranchArguments} - User request
     * @return - async outcome
     *
     */
    async addUser(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        let accessTokens = await this.getAccessTokens(args);
        let id = args.id;
        if (typeof id == "undefined" && ((_a = args.azureActiveDirectoryServicePrincipal) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            let aad = this.createAADCommand();
            let aadArgs = new aad_1.AADAppInstallArguments();
            aadArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
            aadArgs.settings = args.settings;
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`Searching for application ${args.azureActiveDirectoryServicePrincipal}`);
            id = await aad.getAADApplication(aadArgs);
        }
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.verbose(`Checking user ${args.azureActiveDirectoryServicePrincipal} exists in ${environmentUrl}`);
        var dynamicsWebApi = this.createDynamicsWebApi({
            webApiUrl: `${environmentUrl}api/data/v9.1/`,
            onTokenRefresh: (dynamicsWebApiCallback) => dynamicsWebApiCallback(accessTokens[environmentUrl])
        });
        let businessUnitId = '';
        await dynamicsWebApi.executeUnboundFunction("WhoAmI").then(function (response) {
            businessUnitId = response.BusinessUnitId;
        })
            .catch(error => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(error);
        });
        let query = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" no-lock="true">
      <entity name="systemuser">
          <attribute name="applicationid" />
          <filter type="and">
              <condition attribute="applicationid" operator="eq" value="${id}" />
          </filter>
      </entity>
      </fetch>`;
        (_d = this.logger) === null || _d === void 0 ? void 0 : _d.verbose("Query system users");
        let match;
        await dynamicsWebApi.executeFetchXmlAll("systemusers", query).then(function (response) {
            match = response;
        }).catch(error => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(error);
        });
        if ((match === null || match === void 0 ? void 0 : match.value.length) > 0) {
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug('User exists');
        }
        else {
            try {
                (_f = this.logger) === null || _f === void 0 ? void 0 : _f.debug(`Creating application user in ${args.environment}`);
                let user = { "applicationid": id, "businessunitid@odata.bind": `/businessunits(${businessUnitId})` };
                (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info('Creating system user');
                await this.getAxios().post(`${environmentUrl}api/data/v9.1/systemusers`, user, {
                    headers: {
                        "Authorization": `Bearer ${accessTokens[environmentUrl]}`,
                        "Content-Type": "application/json"
                    }
                });
                await dynamicsWebApi.executeFetchXmlAll("systemusers", query).then(function (response) {
                    match = response;
                }).catch(error => {
                    var _a;
                    (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(error);
                });
            }
            catch (err) {
                (_h = this.logger) === null || _h === void 0 ? void 0 : _h.error(err);
                throw err;
            }
        }
        let roleName = args.role;
        if (typeof roleName === "undefined") {
            roleName = typeof args.settings["role"] === "string" ? args.settings["role"] : "System Administrator";
        }
        let roleQuery = `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" no-lock="true">
      <entity name="role">
          <attribute name="roleid" />
          <filter type="and">
              <condition attribute="name" operator="eq" value="${roleName}" />
              <condition attribute="businessunitid" operator="eq" value="${businessUnitId}" />
          </filter>
      </entity>
      </fetch>`;
        let roles;
        await dynamicsWebApi.executeFetchXmlAll("roles", roleQuery).then(function (response) {
            roles = response;
        }).catch(error => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(error);
        });
        if ((roles === null || roles === void 0 ? void 0 : roles.value.length) == 0) {
            (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug(`Role ${roleName} does not exist`);
            return Promise.resolve();
        }
        (_k = this.logger) === null || _k === void 0 ? void 0 : _k.info(`Associating application user ${id} with role ${roleName}`);
        await dynamicsWebApi.associate("systemusers", match === null || match === void 0 ? void 0 : match.value[0].systemuserid, "systemuserroles_association", "roles", roles.value[0].roleid)
            .catch(err => { var _a; (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(err); });
    }
    /**
     * Login and Branch an Azure DevOps repository
     *
     * @param args {ALMBranchArguments} - The branch request
     * @return - async outcome
     *
     */
    async branch(args) {
        var _a, _b, _c, _d, _e, _f;
        try {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Setup branch");
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.verbose(JSON.stringify(args));
            let branchArgs = new devops_1.DevOpsBranchArguments();
            if (args.accessToken === undefined || args.accessToken.length == 0) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("Getting access tokens");
                let tokens = await this.getAccessTokens(args);
                branchArgs.accessToken = tokens["499b84ac-1321-427f-aa17-267ca6975798"];
            }
            else {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("Using supplied access token");
                branchArgs.accessToken = args.accessToken;
            }
            branchArgs.organizationName = args.organizationName;
            branchArgs.projectName = args.projectName;
            branchArgs.repositoryName = args.repositoryName;
            branchArgs.pipelineProject = args.pipelineProject;
            branchArgs.pipelineRepository = args.pipelineRepository;
            branchArgs.sourceBuildName = args.sourceBuildName;
            branchArgs.destinationBranch = args.destinationBranch;
            branchArgs.settings = args.settings;
            branchArgs.openDefaultPages = true;
            let devopsCommand = this.createDevOpsCommand();
            await devopsCommand.branch(branchArgs);
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info("Branch option complete");
        }
        catch (error) {
            (_f = this.logger) === null || _f === void 0 ? void 0 : _f.error(error);
            throw error;
        }
    }
    async getAccessTokens(args) {
        var _a;
        this.logger.info("Start get access tokens");
        let login = this.createLoginCommand();
        let scopes = ["499b84ac-1321-427f-aa17-267ca6975798"];
        if ((_a = args.environment) === null || _a === void 0 ? void 0 : _a.length) {
            this.logger.info(`Get access token for ${args.environment}`);
            let enviromentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
            scopes.push(enviromentUrl);
            if (typeof args.endpoint === "string") {
                let getBapEndpoint = this.getBapEndpoint(args.endpoint);
                scopes.push(getBapEndpoint);
                scopes.push(this.getPowerAppsEndpoint(args.endpoint));
                let authEndPoint = environment_1.Environment.getAuthenticationUrl(getBapEndpoint);
                scopes.push(authEndPoint);
            }
        }
        if ((typeof args.environments === "object") && Object.keys(args.environments).length > 0) {
            let keys = Object.keys(args.environments);
            for (var i = 0; i < keys.length; i++) {
                let enviromentUrl = environment_1.Environment.getEnvironmentUrl(args.environments[keys[i]], args.settings);
                scopes.push(enviromentUrl);
            }
            if (typeof args.endpoint === "string") {
                let getBapEndpoint = this.getBapEndpoint(args.endpoint);
                scopes.push(getBapEndpoint);
                let authEndPoint = environment_1.Environment.getAuthenticationUrl(getBapEndpoint);
                scopes.push(authEndPoint);
            }
        }
        return login === null || login === void 0 ? void 0 : login.azureLogin(scopes);
    }
}
exports.ALMCommand = ALMCommand;
/**
 * ALM Accelerator for Makers User Arguments
 */
class ALMInstallArguments {
    constructor() {
        this.environments = {};
        this.endpoint = "prod";
        this.settings = {};
    }
}
exports.ALMInstallArguments = ALMInstallArguments;
/**
 * ALM Accelerator for Makers User Arguments
 */
class ALMUserArguments {
    constructor() {
        this.clientId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
        this.settings = {};
    }
}
exports.ALMUserArguments = ALMUserArguments;
/**
 * ALM Accelerator for Makers Add Arguments
 */
class ALMMakerAddArguments {
    constructor() {
        this.settings = {};
    }
}
exports.ALMMakerAddArguments = ALMMakerAddArguments;
/**
 * ALM Accelerator for Makers Branch Arguments
 */
class ALMBranchArguments {
    constructor() {
        this.clientId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
        this.settings = {};
    }
}
exports.ALMBranchArguments = ALMBranchArguments;
//# sourceMappingURL=alm.js.map