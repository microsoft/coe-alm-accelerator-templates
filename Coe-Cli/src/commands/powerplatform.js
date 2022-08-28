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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerPlatformCommand = exports.PowerPlatformConectorUpdate = exports.PowerPlatformImportSolutionArguments = void 0;
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const cli_1 = require("../common/cli");
const aad_1 = require("./aad");
const environment_1 = require("../common/environment");
const urlModule = __importStar(require("url"));
const alm_1 = require("./alm");
const readLineManagement_1 = require("../common/readLineManagement");
const config_1 = require("../common/config");
/**
 * Powerplatform commands
 */
class PowerPlatformCommand {
    constructor(logger, defaultReadline = null) {
        this.config = {};
        this.logger = logger;
        this.getAxios = () => axios_1.default;
        this.getBinaryUrl = async (url, authorization = null) => {
            let headers = {
                responseType: 'arraybuffer'
            };
            if (authorization != null && (authorization === null || authorization === void 0 ? void 0 : authorization.length) > 0) {
                headers["Authorization"] = authorization;
                headers["Accept"] = "application/octet-stream";
            }
            return Buffer.from((await this.getAxios().get(url, headers)).data, 'binary');
        };
        this.getUrl = async (url, authorization = null) => {
            let headers = {};
            if (authorization != null) {
                headers["Authorization"] = authorization;
            }
            return (await this.getAxios().get(url, headers)).data;
        };
        this.getSecureJson = async (url, token) => (await this.getAxios().get(url, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'appplication/json'
            }
        })).data;
        this.deleteIfExists = async (name) => {
            if (fs_1.default.existsSync(name)) {
                await fs_1.default.promises.unlink(name);
            }
        };
        this.writeFile = async (name, data) => fs_1.default.promises.writeFile(name, data, 'binary');
        this.cli = new cli_1.CommandLineHelper;
        this.createAADCommand = () => { return new aad_1.AADCommand(this.logger); };
        this.createALMCommand = () => { return new alm_1.ALMCommand(this.logger); };
        this.readline = defaultReadline;
        this.outputText = (text) => console.log(text);
        this.config = config_1.Config.data;
    }
    /**
      * Add an Azure Active Directoiry user as administrator
      * Read more https://docs.microsoft.com/en-us/powershell/module/microsoft.powerapps.administration.powershell/new-powerappmanagementapp
      * @param appId The application id to be added as administrator
      * @param args The additional arguments required to complete install
      * @returns Promise
      */
    async addAdminUser(appId, args) {
        var _a, _b, _c;
        let bapUrl = this.mapEndpoint("bap", args.endpoint);
        let apiVersion = "2020-06-01";
        let authService = environment_1.Environment.getAuthenticationUrl(bapUrl);
        let accessToken = args.accessTokens[authService];
        let results;
        try {
            // Reference
            // Source: Microsoft.PowerApps.Administration.PowerShell
            results = await this.getAxios().put(`${bapUrl}providers/Microsoft.BusinessAppPlatform/adminApplications/${appId}?api-version=${apiVersion}`, {}, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            });
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Added Admin Application for Azure Application");
        }
        catch (err) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Error adding Admin Application for Azure Application");
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.error(err.response.data.error);
            return Promise.reject(err);
        }
    }
    /**
     * Import Solution action
     * @param args
     * @returns
     */
    async importSolution(args) {
        var _a;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Importing Solution via ${args.importMethod}`);
        switch (args.importMethod) {
            case 'api': {
                await this.importViaApi(args);
                break;
            }
            case 'pac': {
                await this.importViaPacCli(args);
                break;
            }
            default: {
                await this.importViaBrowser(args);
                break;
            }
        }
    }
    /**
    * Import solution implementation using REST API
    * @param args
    */
    async importViaApi(args) {
        var _a, _b, _c;
        try {
            let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
            let almSolutionName = 'CenterofExcellenceALMAccelerator';
            let solutions = await this.getSecureJson(`${environmentUrl}api/data/v9.0/solutions?$filter=uniquename%20eq%20%27${almSolutionName}%27`, args.accessToken);
            if (solutions.value.length == 0 || this.config.upgrade == true) {
                let base64CustomizationFile = "";
                if ((_a = args.sourceLocation) === null || _a === void 0 ? void 0 : _a.startsWith("base64:")) {
                    base64CustomizationFile = args.sourceLocation.substring(7);
                }
                else {
                    base64CustomizationFile = (await fs_1.default.promises.readFile(args.sourceLocation, { encoding: 'base64' }));
                }
                let importData = {
                    "OverwriteUnmanagedCustomizations": true,
                    "PublishWorkflows": true,
                    "CustomizationFile": `${base64CustomizationFile}`,
                    "ImportJobId": (0, uuid_1.v4)(),
                    "HoldingSolution": false
                };
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info('Importing managed solution');
                // https://docs.microsoft.com/dynamics365/customer-engagement/web-api/importsolution?view=dynamics-ce-odata-9
                await this.getAxios().post(`${environmentUrl}api/data/v9.0/ImportSolution`, importData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${args.accessToken}`
                    }
                });
                // https://docs.microsoft.com/dynamics365/customer-engagement/web-api/solution?view=dynamics-ce-odata-9
                solutions = await this.getSecureJson(`${environmentUrl}api/data/v9.0/solutions?$filter=uniquename%20eq%20%27${almSolutionName}%27`, args.accessToken);
            }
            else {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info('Solution already exists');
                // TODO: Check if new version is an upgrade
            }
            if (!await this.cli.validateAzCliReady(args)) {
                return Promise.resolve();
            }
            let environment = await this.getEnvironment(args);
            if (environment != null) {
                let solution = solutions.value[0];
                await this.fixCustomConnectors(environment.name, args);
                await this.fixConnectionReferences(environment.name, solutions, args);
                await this.fixFlows(solutions, args);
                await this.addApplicationUsersToEnvironments(args);
                if (args.setupPermissions) {
                    await this.shareMakerApplication(solution, environment.name, args);
                }
            }
        }
        catch (ex) {
            this.logger.error(ex);
        }
    }
    async importViaBrowser(args) {
        var _a, _b, _c, _d, _e, _f;
        let base64CustomizationFile = (await this.getBinaryUrl(args.sourceLocation, args.authorization));
        await this.deleteIfExists('release.zip');
        await this.writeFile('release.zip', base64CustomizationFile);
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info('Complete import in you browser. Steps');
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info('1. Open https://make.powerapps.com');
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info('2. Select environment you want to import solution into');
        (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info('3. Select Solutions');
        (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info('4. Select Import');
        (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info('5. Select Browse and select release.zip downloaded');
    }
    async importViaPacCli(args) {
        let base64CustomizationFile = (await this.getBinaryUrl(args.sourceLocation, args.authorization));
        await this.deleteIfExists('release.zip');
        await this.writeFile('release.zip', base64CustomizationFile);
        await this.cli.runCommand('pac solution import --path release.zip', true);
    }
    /**
 * Map endpoints to defined power platform endpoints
 * @param endpoint
 * @returns
 */
    mapEndpoint(type, endpoint) {
        switch (type) {
            case 'powerapps': {
                switch (endpoint) {
                    case "prod": {
                        return "https://api.powerapps.com/";
                    }
                    case "usgov": {
                        return "https://gov.api.powerapps.us/";
                    }
                    case "usgovhigh": {
                        return "https://high.api.powerapps.us/";
                    }
                    case "dod": {
                        return "https://api.apps.appsplatform.us/";
                    }
                    case "china": {
                        return "https://api.powerapps.cn/";
                    }
                    case "preview": {
                        return "https://preview.api.powerapps.com/";
                    }
                    case "tip1": {
                        return "https://tip1.api.powerapps.com/";
                    }
                    case "tip2": {
                        return "https://tip2.api.powerapps.com/";
                    }
                    default: {
                        throw Error("Unsupported endpoint '${this.endpoint}'");
                    }
                }
            }
            case 'bap': {
                switch (endpoint) {
                    case "prod": {
                        return "https://api.bap.microsoft.com/";
                    }
                    case "usgov": {
                        return "https://gov.api.bap.microsoft.us/";
                    }
                    case "usgovhigh": {
                        return "https://high.api.bap.microsoft.us/";
                    }
                    case "dod": {
                        return "https://api.bap.appsplatform.us/";
                    }
                    case "china": {
                        return "https://api.bap.partner.microsoftonline.cn/";
                    }
                    case "preview": {
                        return "https://preview.api.bap.microsoft.com/";
                    }
                    case "tip1": {
                        return "https://tip1.api.bap.microsoft.com/";
                    }
                    case "tip2": {
                        return "https://tip2.api.bap.microsoft.com/";
                    }
                    default: {
                        throw Error("Unsupported endpoint '${this.endpoint}'");
                    }
                }
            }
        }
    }
    async fixCustomConnectors(environment, args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Checking connectors");
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        let connectors = (await this.getSecureJson(`${environmentUrl}api/data/v9.0/connectors`, args.accessToken)).value;
        let connectorMatch = connectors === null || connectors === void 0 ? void 0 : connectors.filter((c) => c.name.startsWith('cat_5Fcustomazuredevops'));
        if ((connectorMatch === null || connectorMatch === void 0 ? void 0 : connectorMatch.length) == 1) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Found connector");
            let aad = this.createAADCommand();
            let addInstallArgs = new aad_1.AADAppInstallArguments();
            addInstallArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
            addInstallArgs.azureActiveDirectoryMakersGroup = args.azureActiveDirectoryMakersGroup;
            addInstallArgs.createSecret = args.createSecret;
            addInstallArgs.accessTokens = args.accessTokens;
            addInstallArgs.endpoint = args.endpoint;
            let clientid = aad.getAADApplication(addInstallArgs);
            if (typeof connectorMatch[0].connectionparameters === "undefined" || ((_c = connectorMatch[0].connectionparameters) === null || _c === void 0 ? void 0 : _c.length) == 0 || connectorMatch[0].connectionparameters == "{}") {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("Applying default connection information");
                connectorMatch[0].connectionparameters = JSON.stringify({
                    "token": {
                        "type": "oauthSetting",
                        "oAuthSettings": {
                            "identityProvider": "aad",
                            "clientId": "UPDATE",
                            "scopes": [],
                            "redirectMode": "Global",
                            "redirectUrl": "https://global.consent.azure-apim.net/redirect",
                            "properties": {
                                "IsFirstParty": "False",
                                "AzureActiveDirectoryResourceId": "499b84ac-1321-427f-aa17-267ca6975798",
                                "IsOnbehalfofLoginSupported": true
                            },
                            "customParameters": {
                                "loginUri": {
                                    "value": "https://login.windows.net"
                                },
                                "tenantId": {
                                    "value": "common"
                                },
                                "resourceUri": {
                                    "value": "499b84ac-1321-427f-aa17-267ca6975798"
                                },
                                "enableOnbehalfOfLogin": {
                                    "value": "false"
                                }
                            }
                        }
                    },
                    "token:TenantId": {
                        "type": "string",
                        "metadata": {
                            "sourceType": "AzureActiveDirectoryTenant"
                        },
                        "uiDefinition": {
                            "constraints": {
                                "required": "false",
                                "hidden": "true"
                            }
                        }
                    }
                });
            }
            let connectionParameters = JSON.parse(connectorMatch[0].connectionparameters);
            if (typeof connectionParameters.token != undefined && connectionParameters.token.oAuthSettings.clientId != clientid || connectionParameters.token.oAuthSettings.properties.AzureActiveDirectoryResourceId != "499b84ac-1321-427f-aa17-267ca6975798") {
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug("Connector needs update");
                let powerAppsUrl = this.mapEndpoint("powerapps", args.endpoint);
                let bapUrl = this.mapEndpoint("bap", args.endpoint);
                let token = args.accessTokens[bapUrl];
                let connectorName = connectorMatch[0].connectorinternalid;
                // Based on work of paconn update (see below)
                let url = `${powerAppsUrl}providers/Microsoft.PowerApps/apis/${connectorName}/?$filter=environment eq '${environment}'&api-version=2016-11-01`;
                let secret = await aad.addSecret(addInstallArgs, "AzDOCustomConnector");
                let getConnection;
                try {
                    getConnection = await this.getAxios().get(url, {
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        }
                    });
                }
                catch (err) {
                    (_f = this.logger) === null || _f === void 0 ? void 0 : _f.error(err);
                }
                let data = getConnection.data;
                // Fetch the existing swagger to pass to open api specification below
                let original = await this.getAxios().get(data.properties.apiDefinitions.originalSwaggerUrl);
                url = `${powerAppsUrl}providers/Microsoft.PowerApps/apis/${connectorName}/?$filter=environment eq '${environment}'&api-version=2016-11-01`;
                let updateConnection;
                try {
                    if (typeof connectionParameters.token != "undefined") {
                        // Based on work of paconn update of 
                        // https://github.com/microsoft/PowerPlatformConnectors/blob/1b81ada7b083302b59c33d9ed6b14cb2ac8a0785/tools/paconn-cli/paconn/operations/upsert.py
                        if (typeof connectionParameters.token.oAuthSettings.customParameters !== "undefined") {
                            connectionParameters.token.oAuthSettings.customParameters.resourceUri.value = "499b84ac-1321-427f-aa17-267ca6975798";
                        }
                        if (typeof connectionParameters.token.oAuthSettings.properties !== "undefined") {
                            connectionParameters.token.oAuthSettings.properties.AzureActiveDirectoryResourceId = "499b84ac-1321-427f-aa17-267ca6975798";
                        }
                        let update = {
                            properties: {
                                connectionParameters: {
                                    token: {
                                        oAuthSettings: {
                                            clientId: clientid,
                                            clientSecret: secret.clientSecret,
                                            properties: connectionParameters.token.oAuthSettings.properties,
                                            customParameters: connectionParameters.token.oAuthSettings.customParameters,
                                            identityProvider: connectionParameters.token.oAuthSettings.identityProvider,
                                            redirectMode: connectionParameters.token.oAuthSettings.redirectMode,
                                            scopes: connectionParameters.token.oAuthSettings.scopes
                                        },
                                        type: "oAuthSetting"
                                    }
                                },
                                backendService: data.properties.backendService,
                                environment: { name: environment },
                                description: data.properties.description,
                                openApiDefinition: original.data,
                                policyTemplateInstances: data.properties.policyTemplateInstances
                            }
                        };
                        updateConnection = await this.getAxios().patch(url, update, {
                            headers: {
                                "Authorization": `Bearer ${token}`,
                                "Content-Type": "application/json;charset=UTF-8"
                            }
                        });
                    }
                }
                catch (err) {
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.error(err);
                }
                (_h = this.logger) === null || _h === void 0 ? void 0 : _h.info("Connnection updated");
                (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug(updateConnection === null || updateConnection === void 0 ? void 0 : updateConnection.status);
            }
        }
    }
    async getEnvironment(args) {
        var _a, _b, _c;
        let bapUrl = this.mapEndpoint("bap", args.endpoint);
        let apiVersion = "2019-05-01";
        let accessToken = args.accessTokens[bapUrl];
        let results;
        try {
            // Reference
            // https://docs.microsoft.com/power-platform/admin/list-environments
            results = await this.getAxios().get(`${bapUrl}providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=${apiVersion}`, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            });
        }
        catch (err) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(err.response.data.error);
            throw err;
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug('Searching for environment');
        let domainName = args.environment;
        try {
            let domainUrl = new urlModule.URL(domainName);
            domainName = domainUrl.hostname.split(".")[0];
        }
        catch (_d) {
        }
        let environments = results.data.value;
        let match = environments.filter((e) => { var _a, _b; return ((_b = (_a = e.properties) === null || _a === void 0 ? void 0 : _a.linkedEnvironmentMetadata) === null || _b === void 0 ? void 0 : _b.domainName.toLowerCase()) == domainName.toLowerCase(); });
        if (match.length == 1) {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug('Found environment');
            return match[0];
        }
        else {
            Promise.reject(`Environment ${domainName} not found`);
            return null;
        }
    }
    async fixConnectionReferences(environment, solutions, args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (typeof solutions == undefined || typeof solutions.value == undefined || solutions.value.length <= 0) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error("No solution found");
            return;
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Check connection reference");
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        let whoAmI = await this.getSecureJson(`${environmentUrl}api/data/v9.0/WhoAmI`, args.accessToken);
        let aadInfo = (await this.getSecureJson(`${environmentUrl}api/data/v9.0/systemusers?$filter=systemuserid eq '${whoAmI.UserId}'&$select=azureactivedirectoryobjectid`, args.accessToken));
        let solutionComponentTypes = (await this.getSecureJson(`${environmentUrl}api/data/v9.0/solutioncomponentdefinitions?$filter=primaryentityname eq 'connectionreference'`, args.accessToken));
        let solutionComponentType = solutionComponentTypes.value[0].solutioncomponenttype;
        let connectionReferenceSolutionComponents = (await this.getSecureJson(`${environmentUrl}api/data/v9.0/solutioncomponents?$orderby=componenttype&$filter=_solutionid_value eq '${solutions.value[0].solutionid}' and componenttype eq ${solutionComponentType}`, args.accessToken));
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug('Query environment connections');
        let powerAppsUrl = this.mapEndpoint("powerapps", args.endpoint);
        let bapUrl = this.mapEndpoint("bap", args.endpoint);
        let token = args.accessTokens[bapUrl];
        // Source: Microsoft.PowerApps.Administration.PowerShell.psm1
        let url = `${powerAppsUrl}providers/Microsoft.PowerApps/scopes/admin/environments/${environment}/connections?api-version=2016-11-01`;
        let stopped = false;
        let connected = [];
        let connection = null;
        while (!stopped) {
            for (var i = 0; i < connectionReferenceSolutionComponents.value.length; i++) {
                let connectionReferenceId = connectionReferenceSolutionComponents.value[i].objectid;
                if (connected.indexOf(connectionReferenceId) >= 0) {
                    if (connected.length == connectionReferenceSolutionComponents.value.length) {
                        stopped = true;
                        break;
                    }
                    continue;
                }
                let connectionReferenceUrl = `${environmentUrl}api/data/v9.0/connectionreferences?$filter=connectionreferenceid eq '${connectionReferenceId}'`;
                let connectionReferences = (await this.getSecureJson(connectionReferenceUrl, args.accessToken)).value;
                let unconnectedConnectionReferences = connectionReferences.filter((con) => con.connectionid == null);
                let connectedConnectionReferences = connectionReferences.filter((con) => con.connectionid != null);
                if (connectedConnectionReferences.length == 1) {
                    let connectionResults = await this.getAxios().get(url, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    connection = connectionResults.data.value.filter((c) => c.name == connectedConnectionReferences[0].connectionid);
                    if (connection.length == 1) {
                        connected.push(connectionReferenceId);
                        continue;
                    }
                }
                let connectionTypeParts = (_e = (_d = unconnectedConnectionReferences[0]) === null || _d === void 0 ? void 0 : _d.connectorid) === null || _e === void 0 ? void 0 : _e.split('/');
                let connectionType = unconnectedConnectionReferences.length > 0 && typeof connectionTypeParts !== "undefined" ? connectionTypeParts[connectionTypeParts.length - 1] : "";
                if (connectionType == '' && connectedConnectionReferences.length > 0) {
                    connectionTypeParts = (_g = (_f = connectedConnectionReferences[0]) === null || _f === void 0 ? void 0 : _f.connectorid) === null || _g === void 0 ? void 0 : _g.split('/');
                    connectionType = connectedConnectionReferences.length > 0 && typeof connectionTypeParts !== "undefined" ? connectionTypeParts[connectionTypeParts.length - 1] : "";
                }
                let connectionResults = await this.getAxios().get(url, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                connection = connectionResults.data.value.filter((c) => { var _a, _b; return ((_a = c.properties.createdBy) === null || _a === void 0 ? void 0 : _a.id) == aadInfo.value[0].azureactivedirectoryobjectid && ((_b = c.properties.apiId) === null || _b === void 0 ? void 0 : _b.endsWith(`/${connectionType}`)); });
                if (connection.length == 0) {
                    if (unconnectedConnectionReferences.length > 0) {
                        (_h = this.logger) === null || _h === void 0 ? void 0 : _h.error(`Missing '${unconnectedConnectionReferences[0].connectionreferencedisplayname}' connection reference`);
                    }
                    this.readline = readLineManagement_1.ReadLineManagement.setupReadLine(this.readline);
                    let result = await new Promise((resolve, reject) => {
                        this.readline.question("Create connection now (Y/n)? ", (answer) => {
                            if (answer.length == 0 || answer.toLowerCase() == 'y') {
                                resolve('y');
                            }
                            else {
                                resolve('n');
                            }
                        });
                    });
                    if (result == 'y') {
                        this.outputText(`Create a connection by opening page https://make.powerapps.com/environments/${environment}/connections/available?apiName=${connectionType} in your browser`);
                        result = await new Promise((resolve, reject) => {
                            this.readline.question("Check again now (Y/n)? ", (answer) => {
                                if (answer.length == 0 || answer.toLowerCase() == 'y') {
                                    resolve('y');
                                }
                                else {
                                    resolve('n');
                                }
                            });
                        });
                    }
                    if (result == 'n') {
                        (_j = this.logger) === null || _j === void 0 ? void 0 : _j.info("Exiting install");
                        stopped = true;
                        return Promise.resolve();
                    }
                    connectionResults = await this.getAxios().get(url, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                }
                connection = connectionResults.data.value.filter((c) => { var _a, _b; return ((_a = c.properties.createdBy) === null || _a === void 0 ? void 0 : _a.id) == aadInfo.value[0].azureactivedirectoryobjectid && ((_b = c.properties.apiId) === null || _b === void 0 ? void 0 : _b.endsWith(`/${connectionType}`)); });
                if (connection.length > 0) {
                    try {
                        let update = {
                            "connectionid": `${connection[0].name}`
                        };
                        await this.getAxios().patch(`${environmentUrl}api/data/v9.0/connectionreferences(${unconnectedConnectionReferences[0].connectionreferenceid})`, update, {
                            headers: {
                                'Authorization': 'Bearer ' + args.accessToken,
                                'Content-Type': 'application/json',
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                'If-Match': '*'
                            }
                        });
                        (_k = this.logger) === null || _k === void 0 ? void 0 : _k.info("Connection reference updated");
                        connected.push(connectionReferenceId);
                    }
                    catch (err) {
                        (_l = this.logger) === null || _l === void 0 ? void 0 : _l.error(err);
                    }
                }
            }
        }
        (_m = this.readline) === null || _m === void 0 ? void 0 : _m.close();
        this.readline = null;
    }
    /**
     * Start any closed flows for the solution
     * @param solutions
     * @param args
     */
    async fixFlows(solutions, args) {
        var _a, _b, _c, _d, _e;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Checking flow enabled");
        if (typeof solutions === "undefined" || solutions.value.length == 0) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Unable to update flow, solution not found");
            return Promise.resolve();
        }
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        let flows = (await this.getSecureJson(`${environmentUrl}api/data/v9.0/workflows?$filter=solutionid eq '${solutions.value[0].solutionid}'`, args.accessToken));
        for (let i = 0; i < ((_c = flows.value) === null || _c === void 0 ? void 0 : _c.length); i++) {
            let flow = flows.value[i];
            if (flow.statecode == 0 && flow.statuscode == 1) {
                let flowUpdate = {
                    statecode: 1,
                    statuscode: 2
                };
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Enabling flow ${flow.name}`);
                await this.getAxios().patch(`${environmentUrl}api/data/v9.0/workflows(${flow.workflowid})`, flowUpdate, {
                    headers: {
                        'Authorization': 'Bearer ' + args.accessToken,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0',
                        'If-Match': '*'
                    }
                });
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`Patch complete for ${flow.name}`);
            }
        }
    }
    async addApplicationUsersToEnvironments(args) {
        let environments = [];
        if (Array.isArray(args.settings["installEnvironments"])) {
            for (var i = 0; i < args.settings["installEnvironments"].length; i++) {
                let environmentName = args.settings["installEnvironments"][i];
                if (typeof args.settings[environmentName] === "string" && environments.filter((e) => e == args.settings[environmentName]).length == 0) {
                    environments.push(args.settings[environmentName]);
                }
            }
        }
        let alm = this.createALMCommand();
        let almArgs = new alm_1.ALMUserArguments();
        for (var i = 0; i < environments.length; i++) {
            almArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
            almArgs.environment = environments[i];
            await alm.addUser(almArgs);
        }
    }
    async shareMakerApplication(solution, environment, args) {
        var _a, _b, _c, _d, _e, _f;
        let environmentUrl = environment_1.Environment.getEnvironmentUrl(args.environment, args.settings);
        let powerAppsUrl = this.mapEndpoint("powerapps", args.endpoint);
        let bapUrl = this.mapEndpoint("bap", args.endpoint);
        let accessToken = args.accessTokens[bapUrl];
        let config = {
            headers: {
                'Authorization': 'Bearer ' + args.accessToken,
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'If-Match': '*'
            }
        };
        let powerAppsConfig = {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
                'If-Match': '*'
            }
        };
        let command = this.createAADCommand();
        let aadGroupId = command.getAADGroup(args);
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("Searching for solution components");
        // https://docs.microsoft.com/dynamics365/customerengagement/on-premises/developer/entities/msdyn_solutioncomponentsummary?view=op-9-1
        let componentQuery = await this.getAxios().get(`${environmentUrl}api/data/v9.0/msdyn_solutioncomponentsummaries?%24filter=(msdyn_solutionid%20eq%20${solution.solutionid})&api-version=9.1`, config);
        let components = componentQuery.data.value;
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.verbose(components);
        let makeCanvasApp = "ALM Accelerator for Power Platform";
        let componentMatch = components.filter((c) => { return c.msdyn_displayname == makeCanvasApp; });
        if (componentMatch.length == 1) {
            let appName = componentMatch[0].msdyn_objectid;
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug("Searching for permissions");
            let url = `${powerAppsUrl}providers/Microsoft.PowerApps/apps/${appName}/permissions?$expand=permissions($filter=environment eq '${environment}')&api-version=2020-06-01`;
            let permissionsRequest = await this.getAxios().get(url, powerAppsConfig);
            let permissions = permissionsRequest.data.value;
            if (permissions.filter((p) => { return p.properties.principal.displayName == args.azureActiveDirectoryMakersGroup; }).length == 0) {
                let apiInvokeConfig = {
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'Content-Type': 'application/json',
                        'x-ms-path-query': `/providers/Microsoft.PowerApps/apps/${appName}/modifyPermissions?$filter=environment eq '${environment}'&api-version=2020-06-01`
                    }
                };
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Adding CanView permissions for group ${args.azureActiveDirectoryMakersGroup}`);
                url = `${powerAppsUrl}api/invoke`;
                this.getAxios().post(url, {
                    put: [
                        {
                            properties: {
                                NotifyShareTargetOption: "DoNotNotify",
                                principal: {
                                    email: args.azureActiveDirectoryMakersGroup,
                                    id: aadGroupId,
                                    tenantId: null,
                                    type: "Group"
                                },
                                roleName: "CanView"
                            }
                        }
                    ]
                }, apiInvokeConfig);
            }
        }
        else {
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.error(`Unable to find ${makeCanvasApp}`);
        }
        (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info(`Checking ${args.azureActiveDirectoryMakersGroup} permissions`);
        await this.assignRoleToAADGroup(args.azureActiveDirectoryMakersGroup, aadGroupId, 'ALM Power App Access', environmentUrl, config);
    }
    async assignRoleToAADGroup(aadGroupName, aadGroupId, roleName, environmentUrl, config) {
        var _a, _b, _c, _d, _e, _f, _g;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Checking if role ${roleName} exists`);
        let roleQuery = await this.getAxios().get(`${environmentUrl}api/data/v9.0/roles?$filter=name eq '${roleName}'`, config);
        if (((_b = roleQuery.data.value) === null || _b === void 0 ? void 0 : _b.length) == 1) {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info("Role found");
            let roleId = roleQuery.data.value[0].roleid;
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Searching for assigned roles for ${aadGroupName}`);
            let aadPermissionsQuery = await this.getAxios().get(`${environmentUrl}api/data/v9.0/teams(azureactivedirectoryobjectid=${aadGroupId},membershiptype=0)/teamroles_association/$ref`, config);
            let match = (_e = aadPermissionsQuery.data.value) === null || _e === void 0 ? void 0 : _e.filter((r) => (r['@odata.id'].indexOf(roleId) >= 0));
            if (match.length == 0) {
                (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info("Role not yet assigned, adding role");
                let aadPermissionsUpdate = await this.getAxios().post(`${environmentUrl}api/data/v9.0/teams(azureactivedirectoryobjectid=${aadGroupId},membershiptype=0)/teamroles_association/$ref`, {
                    "@odata.id": `${environmentUrl}api/data/v9.0/roles(${roleId})`
                }, config);
                if (aadPermissionsUpdate.status == 200 || aadPermissionsUpdate.status == 204) {
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info(`Assigned ${aadGroupName} to ALM Power App Access role`);
                }
            }
        }
        else {
            this.logger.error("Security Role ALM Power App Access not found");
        }
    }
}
exports.PowerPlatformCommand = PowerPlatformCommand;
/**
 * Powerplatform Command Arguments
 */
class PowerPlatformImportSolutionArguments {
    constructor() {
        this.accessTokens = {};
        this.settings = {};
        this.setupPermissions = true;
    }
}
exports.PowerPlatformImportSolutionArguments = PowerPlatformImportSolutionArguments;
class PowerPlatformConectorUpdate {
}
exports.PowerPlatformConectorUpdate = PowerPlatformConectorUpdate;
//# sourceMappingURL=powerplatform.js.map