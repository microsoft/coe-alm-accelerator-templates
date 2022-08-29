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
exports.DevOpsCommand = exports.DevOpsInstallArguments = exports.DevOpsBranchArguments = void 0;
const azdev = __importStar(require("azure-devops-node-api"));
const util_1 = __importDefault(require("util"));
const GitInterfaces_1 = require("azure-devops-node-api/interfaces/GitInterfaces");
const BuildInterfaces = __importStar(require("azure-devops-node-api/interfaces/BuildInterfaces"));
const github_1 = require("./github");
const axios_1 = __importDefault(require("axios"));
const open = require("open");
const child_process_1 = require("child_process");
const path = require("path");
const fs = __importStar(require("fs"));
const aad_1 = require("./aad");
const environment_1 = require("../common/environment");
const prompt_1 = require("../common/prompt");
const url_1 = __importDefault(require("url"));
const { spawnSync } = require("child_process");
/**
* Azure DevOps Commands
*/
class DevOpsCommand {
    constructor(logger, defaultFs = null) {
        this.logger = logger;
        this.createWebApi = (orgUrl, authHandler) => new azdev.WebApi(orgUrl, authHandler);
        this.createAADCommand = () => new aad_1.AADCommand(this.logger);
        this.createGitHubCommand = () => new github_1.GitHubCommand(this.logger);
        this.deleteIfExists = async (name, type) => {
            if (fs.existsSync(name)) {
                if (type == "file")
                    await fs.promises.unlink(name);
                else if (type == "directory") {
                    await fs.promises.rm(name, { recursive: true });
                }
            }
        };
        this.writeFile = async (name, data) => fs.promises.writeFile(name, data, 'binary');
        this.getUrl = async (url, config = null) => {
            if (config == null) {
                return (await (axios_1.default.get(url))).data;
            }
            else {
                return (await (axios_1.default.get(url, config))).data;
            }
        };
        this.runCommand = (command, displayOutput) => {
            if (displayOutput) {
                return (0, child_process_1.execSync)(command, { stdio: 'inherit', encoding: 'utf8' });
            }
            else {
                return (0, child_process_1.execSync)(command, { encoding: 'utf8' });
            }
        };
        this.prompt = new prompt_1.Prompt();
        this.getHttpClient = (connection) => connection.rest.client;
        if (defaultFs == null) {
            this.readFile = fs.promises.readFile;
        }
        else {
            this.readFile = defaultFs.readFile;
        }
    }
    /**
     *
     * @param args Install components required to run ALM using Azure CLI commands
     * @returns
     */
    async install(args) {
        var _a;
        let extensions = path.join(__dirname, '..', '..', '..', 'config', 'AzureDevOpsExtensionsDetails.json');
        let orgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
        if (args.extensions.length == 0) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info('Loading DevOps Extensions Configuration');
            let extensionConfig = JSON.parse(await this.readFile(extensions, 'utf-8'));
            for (let i = 0; i < extensionConfig.length; i++) {
                args.extensions.push({
                    name: extensionConfig[i].extensionId,
                    publisher: extensionConfig[i].publisherId
                });
            }
        }
        let authHandler = azdev.getHandlerFromToken(typeof args.accessTokens["499b84ac-1321-427f-aa17-267ca6975798"] !== "undefined" ? args.accessTokens["499b84ac-1321-427f-aa17-267ca6975798"] : args.accessToken);
        let connection = this.createWebApi(orgUrl, authHandler);
        await this.installExtensions(args, connection);
        let repo = await this.importPipelineRepository(args, connection);
        if (repo !== null) {
            await this.createMakersBuildPipelines(args, connection, repo);
            let securityContext = await this.setupSecurity(args, connection);
            await this.createMakersBuildVariables(args, connection, securityContext);
            await this.createMakersServiceConnections(args, connection);
        }
    }
    async setupSecurity(args, connection) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let context = {};
        let coreApi = await connection.getCoreApi();
        let projects = await coreApi.getProjects();
        let project = projects.filter(p => { var _a, _b; return ((_a = p.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) == ((_b = args.projectName) === null || _b === void 0 ? void 0 : _b.toLowerCase()); });
        if (project.length != 1) {
            return Promise.resolve(context);
        }
        let client = this.getHttpClient(connection);
        let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
        context.projectId = project[0].id;
        context.securityUrl = devOpsOrgUrl.replace("https://dev", "https://vssps.dev");
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Getting descriptor for project ${project[0].id}`);
        // https://docs.microsoft.com/rest/api/azure/devops/graph/Descriptors/Get?view=azure-devops-rest-6.0
        context.projectDescriptor = await this.getSecurityDescriptor(client, context.securityUrl, project[0].id);
        let headers = {};
        headers["Content-Type"] = "application/json";
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Getting groups for project ${args.projectName} (${context.projectDescriptor})`);
        // Get groups for the project
        // https://docs.microsoft.com/rest/api/azure/devops/graph/groups/list?view=azure-devops-rest-6.0
        let query = await client.get(`${context.securityUrl}_apis/Graph/Groups?scopeDescriptor=${context.projectDescriptor}&api-version=6.0-preview.1`);
        let groupJson = await query.readBody();
        let groups = JSON.parse(groupJson);
        let groupMatch = groups.value.filter((g) => g.displayName == "ALM Accelerator for Makers");
        let almGroup;
        if (groupMatch.length == 0) {
            let newGroup = {
                "displayName": "ALM Accelerator for Makers",
                "description": "Members of this group will be able to access resources required for operation of the ALM Accelerator for Makers",
                "storageKey": "",
                "crossProject": false,
                "descriptor": "",
                "restrictedVisibility": false,
                "specialGroupType": "Generic"
            };
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating new Group ${newGroup.displayName}`);
            let create = await client.post(`${context.securityUrl}_apis/graph/groups?scopeDescriptor=${context.projectDescriptor}&api-version=6.0-preview.1`, JSON.stringify(newGroup), headers);
            let createdJson = await create.readBody();
            almGroup = JSON.parse(createdJson);
        }
        else {
            almGroup = groupMatch[0];
        }
        context.almGroup = almGroup;
        let makerAADGroup = await this.getSecurityAADUserGroup(client, context.securityUrl, args.azureActiveDirectoryMakersGroup, almGroup.descriptor);
        if (makerAADGroup != null) {
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Getting members for ALM Accelerator for Makers (${almGroup.originId})`);
            let members = await this.getGroupMembers(client, context.securityUrl, almGroup.descriptor);
            let match = (_e = members === null || members === void 0 ? void 0 : members.value) === null || _e === void 0 ? void 0 : _e.filter((m) => m.memberDescriptor == makerAADGroup);
            if ((match === null || match === void 0 ? void 0 : match.length) == 1) {
                (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info("Group already a member of group");
            }
            else {
                (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info("Adding member to group");
                let update = await client.put(`${context.securityUrl}_apis/Graph/Memberships/${makerAADGroup}/${almGroup.descriptor}?api-version=5.2-preview.1`, "", headers);
                let updateData = await update.readBody();
                (_h = this.logger) === null || _h === void 0 ? void 0 : _h.debug(updateData);
            }
        }
        return context;
    }
    async getSecurityAADUserGroup(client, url, name, groupDescriptor) {
        var _a, _b, _c, _d, _e, _f;
        let headers = {};
        headers["Content-Type"] = "application/json";
        let request = {
            "query": name,
            "identityTypes": ["user", "group"],
            "operationScopes": ["ims", "source"],
            "options": { "MinResults": 5, "MaxResults": 20 },
            "properties": ["DisplayName", "SubjectDescriptor"]
        };
        let descriptor = await client.post(`${url}_apis/IdentityPicker/Identities?api-version=6.0-preview.1`, JSON.stringify(request), headers);
        let descriptorJson = await descriptor.readBody();
        let descriptorInfo = JSON.parse(descriptorJson);
        let aadGroupFilter = (i) => i.displayName == name && i.entityType == "Group" && i.originDirectory == 'aad';
        let devOpsAADGroupFilter = (i) => i.displayName == `[TEAM FOUNDATION]\\${name}` && i.entityType == "Group" && i.originDirectory == 'aad';
        let match = (_a = descriptorInfo.results) === null || _a === void 0 ? void 0 : _a.filter((r) => { var _a; return ((_a = r.identities) === null || _a === void 0 ? void 0 : _a.filter((i) => aadGroupFilter(i) || devOpsAADGroupFilter(i)).length) == 1; });
        if (match.length == 1) {
            let identityMatch = (_b = match[0].identities) === null || _b === void 0 ? void 0 : _b.filter((i) => aadGroupFilter(i) || devOpsAADGroupFilter(i))[0];
            if (identityMatch.subjectDescriptor == null) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Adding Azure Active Directory Group (${identityMatch.originId}) to DevOps`);
                let addToDevOps = await client.post(`${url}_apis/Graph/Groups?groupDescriptors=${groupDescriptor}&api-version=5.2-preview.1`, JSON.stringify({ "originId": identityMatch.originId, "storageKey": "" }), headers);
                let resultJson = await addToDevOps.readBody();
                let addToDevOpsResult = JSON.parse(resultJson);
                return addToDevOpsResult.descriptor;
            }
            else {
                return identityMatch.subjectDescriptor;
            }
        }
        if (match.length == 0) {
            this.logger.info(`No match found for Azure Active Directory Group ${name}`);
            return null;
        }
        this.logger.info(`Multiple matches Azure Active Directory Group ${name}`);
        for (let i = 0; i < ((_e = (_d = descriptorInfo === null || descriptorInfo === void 0 ? void 0 : descriptorInfo.results) === null || _d === void 0 ? void 0 : _d.identities) === null || _e === void 0 ? void 0 : _e.length); i++) {
            this.logger.info((_f = descriptorInfo === null || descriptorInfo === void 0 ? void 0 : descriptorInfo.results) === null || _f === void 0 ? void 0 : _f.identities[i].displayName);
        }
        return null;
    }
    async getSecurityAADUserGroupReference(client, url, name, groupDescriptor) {
        var _a, _b, _c, _d, _e, _f;
        let headers = {};
        headers["Content-Type"] = "application/json";
        let request = {
            "query": name,
            "identityTypes": ["user", "group"],
            "operationScopes": ["ims", "source"],
            "options": { "MinResults": 5, "MaxResults": 20 },
            "properties": ["DisplayName", "SubjectDescriptor"]
        };
        let descriptor = await client.post(`${url}_apis/IdentityPicker/Identities?api-version=6.0-preview.1`, JSON.stringify(request), headers);
        let descriptorJson = await descriptor.readBody();
        let descriptorInfo = JSON.parse(descriptorJson);
        let aadGroupFilter = (i) => i.displayName == name && i.entityType == "Group" && i.originDirectory == 'aad';
        let devOpsAADGroupFilter = (i) => i.displayName == `[TEAM FOUNDATION]\\${name}` && i.entityType == "Group" && i.originDirectory == 'aad';
        let match = (_a = descriptorInfo.results) === null || _a === void 0 ? void 0 : _a.filter((r) => { var _a; return ((_a = r.identities) === null || _a === void 0 ? void 0 : _a.filter((i) => aadGroupFilter(i) || devOpsAADGroupFilter(i)).length) == 1; });
        if (match.length == 1) {
            let identityMatch = (_b = match[0].identities) === null || _b === void 0 ? void 0 : _b.filter((i) => aadGroupFilter(i) || devOpsAADGroupFilter(i))[0];
            if (identityMatch.subjectDescriptor == null) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Adding Azure Active Directory Group (${identityMatch.originId}) to DevOps`);
                let addToDevOps = await client.post(`${url}_apis/Graph/Groups?groupDescriptors=${groupDescriptor}&api-version=5.2-preview.1`, JSON.stringify({ "originId": identityMatch.originId, "storageKey": "" }), headers);
                let resultJson = await addToDevOps.readBody();
                let addToDevOpsResult = JSON.parse(resultJson);
                return addToDevOpsResult.descriptor;
            }
            else {
                return identityMatch.subjectDescriptor;
            }
        }
        if (match.length == 0) {
            this.logger.info(`No match found for Azure Active Directory Group ${name}`);
            return null;
        }
        this.logger.info(`Multiple matches Azure Active Directory Group ${name}`);
        for (let i = 0; i < ((_e = (_d = descriptorInfo === null || descriptorInfo === void 0 ? void 0 : descriptorInfo.results) === null || _d === void 0 ? void 0 : _d.identities) === null || _e === void 0 ? void 0 : _e.length); i++) {
            this.logger.info((_f = descriptorInfo === null || descriptorInfo === void 0 ? void 0 : descriptorInfo.results) === null || _f === void 0 ? void 0 : _f.identities[i].displayName);
        }
        return null;
    }
    async getSecurityDescriptor(client, url, id) {
        let descriptor = await client.get(`${url}_apis/graph/descriptors/${id}?api-version=6.0-preview.1`);
        let descriptorJson = await descriptor.readBody();
        let descriptorInfo = JSON.parse(descriptorJson);
        return descriptorInfo.value;
    }
    async getGroupMembers(client, url, id) {
        // https://docs.microsoft.com/rest/api/azure/devops/graph/memberships/list?view=azure-devops-rest-6.0
        let results = await client.get(`${url}_apis/graph/Memberships/${id}?direction=Down&api-version=6.0-preview.1`);
        let resultsJson = await results.readBody();
        return JSON.parse(resultsJson);
    }
    async installExtensions(args, connection) {
        var _a;
        if (args.extensions.length == 0) {
            return Promise.resolve();
        }
        this.logger.info(`Checking DevOps Extensions`);
        let extensionsApi = await connection.getExtensionManagementApi();
        this.logger.info(`Retrieving Extensions`);
        try {
            let extensions = await extensionsApi.getInstalledExtensions();
            for (let i = 0; i < args.extensions.length; i++) {
                let extension = args.extensions[i];
                let match = extensions.filter((e) => e.extensionId == extension.name && e.publisherId == extension.publisher);
                if (match.length == 0) {
                    this.logger.info(`Installing ${extension.name} by ${extension.publisher}`);
                    await extensionsApi.installExtensionByName(extension.publisher, extension.name);
                }
                else {
                    this.logger.info(`Extension ${extension.name} by ${extension.publisher} installed`);
                }
            }
        }
        catch (err) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(err);
            throw err;
        }
    }
    async importPipelineRepository(args, connection) {
        var _a, _b;
        let gitApi = await connection.getGitApi();
        let pipelineProjectName = (typeof args.pipelineProjectName !== "undefined" && ((_a = args.pipelineProjectName) === null || _a === void 0 ? void 0 : _a.length) > 0) ? args.pipelineProjectName : args.projectName;
        this.logger.info(`Checking pipeline repository ${pipelineProjectName} ${args.pipelineRepositoryName}`);
        let repo = await this.getRepository(args, gitApi, pipelineProjectName, args.pipelineRepositoryName);
        if (repo == null) {
            return Promise.resolve(null);
        }
        let command = `./src/powershell/importpipelinerepo.ps1 "${args.organizationName}" "${pipelineProjectName}" "${args.pipelineRepositoryName}" "${args.accessTokens["499b84ac-1321-427f-aa17-267ca6975798"]}"`;
        const child = spawnSync('pwsh', ["-File", command], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            ...{},
        });
        this.logger.info(`Output: ${child.stdout.toString()}`);
        if (child.statusCode != 0) {
            this.logger.info(`Error message: ${child.stderr.toString()}`);
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug('Setting default branch');
        let headers = {};
        headers["Content-Type"] = "application/json";
        let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
        await this.getHttpClient(connection).patch(`${devOpsOrgUrl}${args.projectName}/_apis/git/repositories/${repo.id}?api-version=6.0`, '{"defaultBranch":"refs/heads/main"}', headers);
        this.logger.info(`Pipeline repository ${pipelineProjectName} ${args.pipelineRepositoryName} imported`);
        return repo;
    }
    async getRepository(args, gitApi, projectName, repositoryName) {
        var _a, _b, _c;
        let repos = await gitApi.getRepositories(projectName);
        if (repos == null) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(`${projectName} not found`);
            return Promise.resolve(null);
        }
        if ((repos === null || repos === void 0 ? void 0 : repos.filter(r => r.name == repositoryName).length) == 0) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`Creating repository ${repositoryName}`);
            return await gitApi.createRepository({ name: repositoryName }, projectName);
        }
        else {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Found repository ${repositoryName}`);
            return repos.filter(r => r.name == repositoryName)[0];
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Create Build pipelines required by the ALM Accelerator
     * @param args The installation parameters
     * @param connection The authenticated connection
     * @param repo The pipeline repo to a create builds for
     */
    async createMakersBuildPipelines(args, connection, repo) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        let pipelineProjectName = (typeof args.pipelineProjectName !== "undefined" && ((_a = args.pipelineProjectName) === null || _a === void 0 ? void 0 : _a.length) > 0) ? args.pipelineProjectName : args.projectName;
        connection = await this.createConnectionIfExists(args, connection);
        if (repo == null) {
            let gitApi = await connection.getGitApi();
            repo = await this.getRepository(args, gitApi, pipelineProjectName, args.repositoryName);
        }
        let buildApi = await connection.getBuildApi();
        if (typeof buildApi == "undefined") {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Build API missing");
            return;
        }
        let taskApi = await connection.getTaskAgentApi();
        let core = await connection.getCoreApi();
        let project = await core.getProject(pipelineProjectName);
        if (typeof project !== "undefined") {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(util_1.default.format("Found project %s", project.name));
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Retrieving default Queue`);
            let defaultQueue = (_e = (await (taskApi === null || taskApi === void 0 ? void 0 : taskApi.getAgentQueues(pipelineProjectName)))) === null || _e === void 0 ? void 0 : _e.filter(p => p.name == "Azure Pipelines");
            let defaultAgentQueue = (defaultQueue === null || defaultQueue === void 0 ? void 0 : defaultQueue.length) > 0 ? defaultQueue[0] : undefined;
            (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info(`Default Queue: ${(defaultQueue === null || defaultQueue === void 0 ? void 0 : defaultQueue.length) > 0 ? defaultQueue[0].name : "undefined"}`);
            let builds = await buildApi.getDefinitions(pipelineProjectName);
            let buildNames = ['export-solution-to-git', 'import-unmanaged-to-dev-environment', 'delete-unmanaged-solution-and-components'];
            for (var i = 0; i < buildNames.length; i++) {
                let filteredBuilds = builds.filter(b => b.name == buildNames[i]);
                if (filteredBuilds.length == 0) {
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.debug(`Creating build ${buildNames[i]}`);
                    await this.createBuild(buildApi, repo, buildNames[i], `/Pipelines/${buildNames[i]}.yml`, defaultAgentQueue);
                }
                else {
                    let build = await buildApi.getDefinition(pipelineProjectName, filteredBuilds[0].id);
                    let changes = false;
                    if (typeof build.queue === "undefined") {
                        (_h = this.logger) === null || _h === void 0 ? void 0 : _h.debug(`Missing build queue for ${build.name}`);
                        build.queue = defaultAgentQueue;
                        changes = true;
                    }
                    if (changes) {
                        (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug(`Updating ${build.name}`);
                        await buildApi.updateDefinition(build, pipelineProjectName, filteredBuilds[0].id);
                    }
                    else {
                        (_k = this.logger) === null || _k === void 0 ? void 0 : _k.debug(`No changes to ${buildNames[i]}`);
                    }
                }
            }
        }
    }
    async createMakersBuildVariables(args, connection, securityContext) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let projects = [args.projectName];
        if (typeof args.pipelineProjectName !== "undefined" && ((_a = args.pipelineProjectName) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            projects.push(args.pipelineProjectName);
        }
        for (let i = 0; i < projects.length; i++) {
            connection = await this.createConnectionIfExists(args, connection);
            let taskApi = await connection.getTaskAgentApi();
            let groups = await (taskApi === null || taskApi === void 0 ? void 0 : taskApi.getVariableGroups(projects[i]));
            let variableGroupName = "alm-accelerator-variable-group";
            let global = groups === null || groups === void 0 ? void 0 : groups.filter(g => g.name == variableGroupName);
            let variableGroup = (global === null || global === void 0 ? void 0 : global.length) == 1 ? global[0] : null;
            if ((global === null || global === void 0 ? void 0 : global.length) == 0) {
                let aadCommand = this.createAADCommand();
                let aadArgs = new aad_1.AADAppInstallArguments();
                aadArgs.subscription = args.subscription;
                aadArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
                aadArgs.createSecret = args.createSecretIfNoExist;
                aadArgs.accessTokens = args.accessTokens;
                aadArgs.endpoint = args.endpoint;
                aadArgs.settings = args.settings;
                let secretInfo = await aadCommand.addSecret(aadArgs, "CoE-ALM");
                let aadHost = environment_1.Environment.getAzureADAuthEndpoint(aadArgs.settings).replace("https://", "");
                if (!aadArgs.createSecret) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.warn('Client secret not added for variable group alm-accelerator-variable-group it wil need to be added manually');
                }
                let buildApi = await connection.getBuildApi();
                let builds = await buildApi.getDefinitions(projects[i]);
                let exportBuild = builds.filter(b => b.name == "export-solution-to-git");
                let buildId = exportBuild.length == 1 ? exportBuild[0].id.toString() : "";
                let parameters = {};
                parameters.variableGroupProjectReferences = [
                    {
                        name: variableGroupName,
                        projectReference: {
                            name: projects[i],
                        }
                    }
                ];
                parameters.name = variableGroupName;
                parameters.description = 'ALM Accelerator for Power Platform';
                parameters.variables = {
                    "AADHost": {
                        value: aadHost
                    },
                    "CdsBaseConnectionString": {
                        value: "AuthType=ClientSecret;ClientId=$(ClientId);ClientSecret=$(ClientSecret);Url="
                    },
                    "ClientId": {
                        value: secretInfo.clientId
                    },
                    "ClientSecret": {
                        isSecret: true,
                        value: secretInfo.clientSecret
                    },
                    "TenantID": {
                        value: secretInfo.tenantId
                    }
                };
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating variable group ${variableGroupName}`);
                variableGroup = await taskApi.addVariableGroup(parameters);
            }
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug("Searching for existing role assignements");
            let variableGroupId = `${securityContext.projectId}%24${variableGroup.id}`;
            let client = this.getHttpClient(connection);
            let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
            let variableGroupUrl = `${devOpsOrgUrl}_apis/securityroles/scopes/distributedtask.variablegroup/roleassignments/resources/${variableGroupId}?api-version=6.1-preview.1`;
            let roleRequest = await client.get(variableGroupUrl);
            let roleJson = await roleRequest.readBody();
            let roleAssignmentsResponse = JSON.parse(roleJson);
            let roleAssignments = roleAssignmentsResponse.value;
            if (roleAssignments.filter((r) => r.identity.id == securityContext.almGroup.originId).length == 0) {
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`Adding User role for Group ${securityContext.almGroup.displayName}`);
                let headers = {};
                headers["Content-Type"] = "application/json";
                let updateRequest = await client.put(variableGroupUrl, JSON.stringify([{ "roleName": "User", "userId": securityContext.almGroup.originId }]), headers);
                let newRoleAssignmentJson = await updateRequest.readBody();
                let newRoleAssignmentResult = JSON.parse(newRoleAssignmentJson);
                if (((_f = newRoleAssignmentResult.value) === null || _f === void 0 ? void 0 : _f.length) == 1) {
                    let newRoleAssignment = newRoleAssignmentResult.value[0];
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info(`Added new role assignnment ${newRoleAssignment.identity.displayName} for variable group ${variableGroupName}`);
                }
                else {
                    (_h = this.logger) === null || _h === void 0 ? void 0 : _h.error(`Role for ${securityContext.almGroup.displayName} not assigned to ${variableGroupName}`);
                }
            }
        }
    }
    async createMakersServiceConnections(args, connection, setupEnvironmentConnections = true) {
        var _a, _b, _c;
        let projectNames = [args.projectName];
        if (typeof args.pipelineProjectName !== "undefined" && args.pipelineProjectName != args.projectName) {
            projectNames.push(args.pipelineProjectName);
        }
        for (let projectIndex = 0; projectIndex < projectNames.length; projectIndex++) {
            connection = await this.createConnectionIfExists(args, connection);
            let endpoints = await this.getServiceConnections(args, connection);
            let coreApi = await connection.getCoreApi();
            let projects = await coreApi.getProjects();
            let project = projects.filter(p => { var _a; return ((_a = p.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) == projectNames[projectIndex].toLowerCase(); });
            if (project.length == 0) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(`Azure DevOps project ${projectNames[projectIndex]} not found`);
                return Promise.resolve();
            }
            let aadCommand = this.createAADCommand();
            let aadArgs = new aad_1.AADAppInstallArguments();
            aadArgs.subscription = args.subscription;
            aadArgs.azureActiveDirectoryServicePrincipal = args.azureActiveDirectoryServicePrincipal;
            aadArgs.createSecret = args.createSecretIfNoExist;
            aadArgs.accessTokens = args.accessTokens;
            aadArgs.endpoint = args.endpoint;
            let keys = Object.keys(args.environments);
            let environments = [];
            if (((_b = args.environment) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                environments.push(args.environment);
            }
            let mapping = {};
            if (setupEnvironmentConnections) {
                for (var i = 0; i < keys.length; i++) {
                    let environmentName = args.environments[keys[i]];
                    mapping[environmentName] = keys[i];
                    if (environments.filter((e) => e == environmentName).length == 0) {
                        environments.push(environmentName);
                    }
                }
                if (Array.isArray(args.settings["installEnvironments"])) {
                    for (var i = 0; i < args.settings["installEnvironments"].length; i++) {
                        let environmentName = args.settings["installEnvironments"][i];
                        if (typeof args.settings[environmentName] === "string" && environments.filter((e) => e == args.settings[environmentName]).length == 0) {
                            environments.push(args.settings[environmentName]);
                        }
                    }
                }
            }
            for (var i = 0; i < environments.length; i++) {
                let environmentName = environments[i];
                let endpointUrl = environment_1.Environment.getEnvironmentUrl(environmentName, args.settings);
                let secretName = environmentName;
                try {
                    let environmentUrl = new url_1.default.URL(secretName);
                    secretName = environmentUrl.hostname.split(".")[0];
                }
                catch (_d) {
                }
                let secretInfo = await aadCommand.addSecret(aadArgs, secretName);
                if (endpoints.filter(e => e.name == endpointUrl).length == 0) {
                    let ep = {
                        authorization: {
                            parameters: {
                                tenantId: secretInfo.tenantId,
                                clientSecret: secretInfo.clientSecret,
                                applicationId: secretInfo.clientId
                            },
                            scheme: "None"
                        },
                        name: endpointUrl,
                        type: "powerplatform-spn",
                        url: endpointUrl,
                        description: typeof mapping[environmentName] !== "undefined" ? `Environment ${mapping[environmentName]}` : '',
                        serviceEndpointProjectReferences: [
                            {
                                projectReference: {
                                    id: project[0].id,
                                    name: projectNames[projectIndex]
                                },
                                name: endpointUrl
                            }
                        ]
                    };
                    let headers = {};
                    headers["Content-Type"] = "application/json";
                    let webClient = this.getHttpClient(connection);
                    let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
                    // https://docs.microsoft.com/rest/api/azure/devops/serviceendpoint/endpoints/create?view=azure-devops-rest-6.0
                    let create = await webClient.post(`${devOpsOrgUrl}${projectNames[projectIndex]}/_apis/serviceendpoint/endpoints?api-version=6.0-preview.4`, JSON.stringify(ep), headers);
                    let serviceConnection;
                    serviceConnection = JSON.parse(await create.readBody());
                    if (create.message.statusCode != 200) {
                        return Promise.resolve();
                    }
                    else {
                        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Created service connection ${endpointUrl}`);
                    }
                    await this.assignUserToServiceConnector(project[0], serviceConnection, args, connection);
                }
                else {
                    await this.assignUserToServiceConnector(project[0], endpointUrl, args, connection);
                }
            }
        }
    }
    async assignUserToServiceConnector(project, endpoint, args, connection) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (((_a = args.user) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            let webClient = this.getHttpClient(connection);
            let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args);
            if (typeof endpoint === "string") {
                let results = await webClient.get(`${devOpsOrgUrl}${project.name}/_apis/serviceendpoint/endpoints?api-version=6.0-preview.4`);
                let endpointJson = await results.readBody();
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(endpointJson);
                let endpoints = (JSON.parse(endpointJson).value);
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(endpoints);
                let endPointMatch = endpoints.filter((ep) => ep.url == endpoint);
                if (endPointMatch.length == 1) {
                    endpoint = endPointMatch[0];
                }
                else {
                    this.logger.error(`Unable to find service connection ${endpoint}`);
                    return Promise.resolve();
                }
            }
            let userId = await this.getUserId(devOpsOrgUrl, args.user, connection);
            if (userId == null) {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("No user found -- Exiting");
                return Promise.resolve();
            }
            else {
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info(`Found user ${userId}`);
            }
            let connectorRoles = await webClient.get(`${devOpsOrgUrl}_apis/securityroles/scopes/distributedtask.serviceendpointrole/roleassignments/resources/${project.id}_${endpoint.id}`);
            let connectorData = JSON.parse(await connectorRoles.readBody());
            let connectorMatch = (_f = connectorData.value) === null || _f === void 0 ? void 0 : _f.filter((c) => c.identity.id == userId);
            if ((connectorMatch === null || connectorMatch === void 0 ? void 0 : connectorMatch.length) == 0) {
                let headers = {};
                headers["Content-Type"] = "application/json";
                let newRole = [{
                        "roleName": "User",
                        "userId": userId
                    }];
                //https://docs.microsoft.com/rest/api/azure/devops/securityroles/roleassignments/set%20role%20assignments?view=azure-devops-rest-6.1
                (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info(`Assigning user ${args.user} to service connection ${endpoint.url}`);
                let update = await webClient.put(`${devOpsOrgUrl}_apis/securityroles/scopes/distributedtask.serviceendpointrole/roleassignments/resources/${project.id}_${endpoint.id}?api-version=6.1-preview.1`, JSON.stringify(newRole), headers);
                if (update.message.statusCode != 200) {
                    (_h = this.logger) === null || _h === void 0 ? void 0 : _h.info("Update failed");
                    (_j = this.logger) === null || _j === void 0 ? void 0 : _j.error(await update.readBody());
                }
                else {
                    (_k = this.logger) === null || _k === void 0 ? void 0 : _k.info('User role assigned');
                    let results = await update.readBody();
                    (_l = this.logger) === null || _l === void 0 ? void 0 : _l.debug(results);
                }
            }
            else {
                (_m = this.logger) === null || _m === void 0 ? void 0 : _m.info("User role already assigned");
            }
        }
    }
    async getUserId(devOpsOrgUrl, user, connection) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let client = this.getHttpClient(connection);
        // https://docs.microsoft.com/rest/api/azure/devops/ims/identities/read%20identities?view=azure-devops-rest-6.0#by-email
        let query = await client.get(`${devOpsOrgUrl.replace("https://dev", "https://vssps.dev")}_apis/identities?searchFilter=General&filterValue=${user}&queryMembership=None&api-version=6.0`);
        let identityJson = await query.readBody();
        let users = JSON.parse(identityJson);
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Found ${(_b = users.value) === null || _b === void 0 ? void 0 : _b.length} user(s)`);
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.verbose(users);
        (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Searching for ${user}`);
        let userMatch = (_e = users.value) === null || _e === void 0 ? void 0 : _e.filter((u) => { var _a, _b; return ((_b = (_a = u.properties) === null || _a === void 0 ? void 0 : _a.Account['$value']) === null || _b === void 0 ? void 0 : _b.toLowerCase()) == (user === null || user === void 0 ? void 0 : user.toLowerCase()); });
        if ((userMatch === null || userMatch === void 0 ? void 0 : userMatch.length) == 1) {
            (_f = this.logger) === null || _f === void 0 ? void 0 : _f.debug(`Found user ${userMatch[0].id}`);
            return userMatch[0].id;
        }
        if ((userMatch === null || userMatch === void 0 ? void 0 : userMatch.length) == 0) {
            (_g = this.logger) === null || _g === void 0 ? void 0 : _g.error(`Unable to find ${user} in ${devOpsOrgUrl}, has the used been added?`);
            return null;
        }
        if ((userMatch === null || userMatch === void 0 ? void 0 : userMatch.length) > 1) {
            (_h = this.logger) === null || _h === void 0 ? void 0 : _h.error(`More than one match for ${user} in ${devOpsOrgUrl}`);
            return null;
        }
    }
    /**
     * Retrieve array of current service connections
     * @param connection The authenticated connection
     * @returns
     */
    async getServiceConnections(args, connection) {
        var _a, _b;
        let pipelineProjectName = (typeof args.pipelineProjectName !== "undefined" && ((_a = args.pipelineProjectName) === null || _a === void 0 ? void 0 : _a.length) > 0) ? args.pipelineProjectName : args.projectName;
        let webClient = this.getHttpClient(connection);
        let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args, args.settings);
        let request = await webClient.get(`${devOpsOrgUrl}${pipelineProjectName}/_apis/serviceendpoint/endpoints?api-version=6.0-preview.4`);
        let data = await request.readBody();
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(data);
        return (JSON.parse(data).value);
    }
    async createConnectionIfExists(args, connection) {
        var _a;
        if (connection == null) {
            let authHandler = azdev.getHandlerFromToken(((_a = args.accessToken) === null || _a === void 0 ? void 0 : _a.length) > 0 ? args.accessToken : args.accessTokens["499b84ac-1321-427f-aa17-267ca6975798"], true);
            let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args, args.settings);
            return this.createWebApi(devOpsOrgUrl, authHandler);
        }
        return connection;
    }
    async createBuild(buildApi, repo, name, yamlFilename, defaultQueue) {
        let newBuild = {};
        newBuild.name = name;
        newBuild.repository = {};
        newBuild.repository.defaultBranch = "refs/heads/main";
        newBuild.repository.id = repo.id;
        newBuild.repository.name = repo.name;
        newBuild.repository.url = repo.url;
        newBuild.repository.type = 'TfsGit';
        let process = {};
        process.yamlFilename = yamlFilename;
        newBuild.process = process;
        newBuild.queue = defaultQueue;
        let trigger = {};
        trigger.triggerType = BuildInterfaces.DefinitionTriggerType.ContinuousIntegration;
        trigger.branchFilters = [];
        trigger.pathFilters = [];
        trigger.maxConcurrentBuildsPerBranch = 1;
        trigger.batchChanges = false;
        trigger.settingsSourceType = BuildInterfaces.DefinitionTriggerType.ContinuousIntegration;
        newBuild.triggers = [trigger];
        return buildApi.createDefinition(newBuild, repo.project.name);
    }
    /**
     * Create new branch in Azure DevOps repository
     *
     * @param args {DevOpsBranchArguments} - The branch request
     * @return {Promise} aync outcome
     *
     */
    async branch(args) {
        var _a, _b, _c, _d, _e;
        try {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Pipeline Project: ${args.pipelineProject}`);
            let pipelineProjectName = ((_b = args.pipelineProject) === null || _b === void 0 ? void 0 : _b.length) > 0 ? args.pipelineProject : args.projectName;
            let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args, args.settings);
            let authHandler = azdev.getHandlerFromToken(args.accessToken);
            let connection = this.createWebApi(devOpsOrgUrl, authHandler);
            let core = await connection.getCoreApi();
            let project = await core.getProject(args.projectName);
            let pipelineProject = await core.getProject(pipelineProjectName);
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(util_1.default.format("Found project %s %s", project === null || project === void 0 ? void 0 : project.name, args.projectName));
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(util_1.default.format("Found pipeline project %s %s", pipelineProject === null || pipelineProject === void 0 ? void 0 : pipelineProject.name, pipelineProjectName));
            if (typeof project !== "undefined" && typeof pipelineProject !== "undefined") {
                let gitApi = await connection.getGitApi();
                let repo = await this.createBranch(args, pipelineProject, project, gitApi);
                if (repo != null) {
                    await this.createBuildForBranch(args, project, repo, connection);
                    await this.setBranchPolicy(args, repo, connection);
                }
            }
        }
        catch (error) {
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info(`An error occurred while creating the branch: ${error}`);
            throw error;
        }
    }
    /**
     * Create branch in Azure Devops Repo
     * @param args - The branch arguments
     * @param project Th project to create the project in
     * @param gitApi The open git API connection to create the
     * @returns
     */
    async createBranch(args, pipelineProject, project, gitApi) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        var pipelineRepos = await gitApi.getRepositories(pipelineProject.id);
        var repos = await gitApi.getRepositories(project.id);
        var matchingRepo;
        let repositoryName = args.repositoryName;
        if (typeof repositoryName === "undefined" || (repositoryName === null || repositoryName === void 0 ? void 0 : repositoryName.length) == 0) {
            // No repository defined assume it is the project name
            repositoryName = args.projectName;
        }
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Found ${repos.length} repositories`);
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`Found ${pipelineRepos.length} pipeline repositories`);
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Searching for repository ${pipelineProject.name} ${args.pipelineRepository.toLowerCase()}`);
        let pipelineRepo = pipelineRepos.find((repo) => {
            return repo.name.toLowerCase() == args.pipelineRepository.toLowerCase();
        });
        let repo = pipelineRepos.find((repo) => {
            return repo.name.toLowerCase() == repositoryName.toLowerCase();
        });
        if (pipelineRepo && repo) {
            let foundRepo = false;
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Searching for repository ${project.name} ${repositoryName.toLowerCase()}`);
            if (repo.name.toLowerCase() == repositoryName.toLowerCase()) {
                foundRepo = true;
                matchingRepo = repo;
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info(`Found matching repo ${repositoryName}`);
                let refs = await gitApi.getRefs(repo.id, undefined, "heads/");
                if (refs.length == 0) {
                    this.logger.error("No commits to this repository yet. Initialize this repository before creating new branches");
                    return Promise.resolve(null);
                }
                let sourceBranch = args.sourceBranch;
                if (typeof sourceBranch === "undefined" || ((_f = args.sourceBranch) === null || _f === void 0 ? void 0 : _f.length) == 0) {
                    sourceBranch = this.withoutRefsPrefix(repo.defaultBranch);
                }
                let sourceRef = refs.filter(f => f.name == util_1.default.format("refs/heads/%s", sourceBranch));
                if (sourceRef.length == 0) {
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.error(util_1.default.format("Source branch [%s] not found", sourceBranch));
                    (_h = this.logger) === null || _h === void 0 ? void 0 : _h.debug('Existing branches');
                    for (var refIndex = 0; refIndex < refs.length; refIndex++) {
                        (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug(refs[refIndex].name);
                    }
                    return matchingRepo;
                }
                let destinationRef = refs.filter(f => f.name == util_1.default.format("refs/heads/%s", args.destinationBranch));
                if (destinationRef.length > 0) {
                    (_k = this.logger) === null || _k === void 0 ? void 0 : _k.error("Destination branch already exists");
                    return matchingRepo;
                }
                let newRef = {};
                newRef.repositoryId = repo.id;
                newRef.oldObjectId = sourceRef[0].objectId;
                newRef.name = util_1.default.format("refs/heads/%s", args.destinationBranch);
                let newGitCommit = {};
                newGitCommit.comment = "Add DevOps Pipeline";
                if (typeof args.settings["environments"] === "string") {
                    newGitCommit.changes = await this.getGitCommitChanges(args, gitApi, pipelineRepo, args.destinationBranch, this.withoutRefsPrefix(repo.defaultBranch), args.settings["environments"].split('|').map(element => {
                        return element.toLowerCase();
                    }));
                }
                else {
                    newGitCommit.changes = await this.getGitCommitChanges(args, gitApi, pipelineRepo, args.destinationBranch, this.withoutRefsPrefix(repo.defaultBranch), ['validation', 'test', 'prod']);
                }
                let gitPush = {};
                gitPush.refUpdates = [newRef];
                gitPush.commits = [newGitCommit];
                (_l = this.logger) === null || _l === void 0 ? void 0 : _l.info(util_1.default.format('Pushing new branch %s', args.destinationBranch));
                await gitApi.createPush(gitPush, repo.id, project.name);
            }
            if (!foundRepo && (repositoryName === null || repositoryName === void 0 ? void 0 : repositoryName.length) > 0) {
                (_m = this.logger) === null || _m === void 0 ? void 0 : _m.info(util_1.default.format("Repo %s not found", repositoryName));
                (_o = this.logger) === null || _o === void 0 ? void 0 : _o.info('Did you mean?');
                repos.forEach(repo => {
                    var _a;
                    if (repo.name.startsWith(repositoryName[0])) {
                        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(repo.name);
                    }
                });
            }
        }
        return matchingRepo;
    }
    /**
     *
     * @param args Set the default validation branch policy to a branch
     * @param repo The repository that the branch belongs to
     * @param connection The authentcated connection to the Azure DevOps WebApi
     */
    async setBranchPolicy(args, repo, connection) {
        var _a, _b;
        let policyApi = await connection.getPolicyApi();
        if (policyApi == null) {
            return;
        }
        let policyTypes = await policyApi.getPolicyTypes(args.projectName);
        let buildTypes = policyTypes.filter(p => { if (p.displayName == 'Build') {
            return true;
        } });
        let buildApi = await connection.getBuildApi();
        let builds = await buildApi.getDefinitions(args.projectName);
        let buildMatch = builds.filter(b => { if (b.name == `deploy-validation-${args.destinationBranch}`) {
            return true;
        } });
        if (buildTypes.length > 0) {
            let existingConfigurations = await policyApi.getPolicyConfigurations(args.projectName);
            let existingPolices = existingConfigurations.filter((policy) => {
                var _a;
                if (((_a = policy.settings.scope) === null || _a === void 0 ? void 0 : _a.length) == 1
                    && policy.settings.scope[0].refName == `refs/heads/${args.destinationBranch}`
                    && policy.settings.scope[0].repositoryId == repo.id
                    && policy.type.id == buildTypes[0].id) {
                    return true;
                }
            });
            if ((existingPolices.length == 0) && (buildMatch.length > 0)) {
                let newPolicy = {};
                newPolicy.settings = {};
                newPolicy.settings.buildDefinitionId = buildMatch[0].id;
                newPolicy.settings.displayName = 'Build Validation';
                newPolicy.settings.filenamePatterns = [`/${args.destinationBranch}/*`];
                newPolicy.settings.manualQueueOnly = false;
                newPolicy.settings.queueOnSourceUpdateOnly = false;
                newPolicy.settings.validDuration = 0;
                let repoRef = { refName: `refs/heads/${args.destinationBranch}`, matchKind: 'Exact', repositoryId: repo.id };
                newPolicy.settings.scope = [repoRef];
                newPolicy.type = buildTypes[0];
                newPolicy.isBlocking = true;
                newPolicy.isEnabled = true;
                newPolicy.isEnterpriseManaged = false;
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info('Checking branch policy');
                await policyApi.createPolicyConfiguration(newPolicy, args.projectName);
            }
            else {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info('Branch policy already created');
            }
        }
    }
    withoutRefsPrefix(refName) {
        if (!refName.startsWith("refs/heads/")) {
            throw Error("The ref name should have started with 'refs/heads/' but it didn't.");
        }
        return refName.substr("refs/heads/".length, refName.length - "refs/heads/".length);
    }
    /**
     * Create Azure DevOps builds for branch
     * @param args - The branch to optionally copy from and and destination branch to apply the builds to
     * @param project - The project to add the build to
     * @param connection - The authenticated connection to Azure DevOp WebApi
     */
    async createBuildForBranch(args, project, repo, connection) {
        var _a, _b, _c, _d;
        let buildClient = await connection.getBuildApi();
        let definitions = await buildClient.getDefinitions(project.name);
        let taskApi = await connection.getTaskAgentApi();
        let devOpsOrgUrl = environment_1.Environment.getDevOpsOrgUrl(args, args.settings);
        let baseUrl = `$(devOpsOrgUrl}${args.projectName}`;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Retrieving default Queue`);
        let agentQueues = await (taskApi === null || taskApi === void 0 ? void 0 : taskApi.getAgentQueues(project.id));
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`Found: ${agentQueues === null || agentQueues === void 0 ? void 0 : agentQueues.length} queues`);
        let defaultQueue = agentQueues === null || agentQueues === void 0 ? void 0 : agentQueues.filter(p => p.name == "Azure Pipelines");
        let defaultAgentQueue = (defaultQueue === null || defaultQueue === void 0 ? void 0 : defaultQueue.length) > 0 ? defaultQueue[0] : undefined;
        (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Default Queue: ${(defaultQueue === null || defaultQueue === void 0 ? void 0 : defaultQueue.length) > 0 ? defaultQueue[0].name : "Not Found. You will need to set the default queue manually. Please verify the permissions for the user executing this command include access to queues."}`);
        if (typeof args.settings["environments"] === "string") {
            for (const environment of args.settings["environments"].split('|')) {
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Creating build for environment ${environment}`);
                await this.cloneBuildSettings(definitions, buildClient, project, repo, baseUrl, args, environment, environment.toLowerCase(), args.destinationBranch, defaultAgentQueue);
            }
        }
        else {
            await this.cloneBuildSettings(definitions, buildClient, project, repo, baseUrl, args, "Validation", "validation", args.destinationBranch, defaultAgentQueue);
            await this.cloneBuildSettings(definitions, buildClient, project, repo, baseUrl, args, "Test", "test", args.destinationBranch, defaultAgentQueue);
            await this.cloneBuildSettings(definitions, buildClient, project, repo, baseUrl, args, "Production", "prod", args.destinationBranch, defaultAgentQueue);
        }
    }
    async cloneBuildSettings(pipelines, client, project, repo, baseUrl, args, environmentName, buildName, createInBranch, defaultQueue) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let source = args.sourceBuildName;
        let destination = args.destinationBranch;
        var destinationBuildName = util_1.default.format("deploy-%s-%s", buildName, destination);
        var destinationBuilds = pipelines.filter(p => p.name == destinationBuildName);
        let destinationBuild = destinationBuilds.length > 0 ? await client.getDefinition(destinationBuilds[0].project.name, destinationBuilds[0].id) : null;
        let sourceBuild = null;
        if (typeof (source) != "undefined" && (source.length != 0)) {
            var sourceBuildName = util_1.default.format("deploy-%s-%s", buildName, source);
            var sourceBuilds = pipelines.filter(p => p.name == sourceBuildName);
            sourceBuild = sourceBuilds.length > 0 ? await client.getDefinition((_a = sourceBuilds[0].project) === null || _a === void 0 ? void 0 : _a.name, sourceBuilds[0].id) : null;
            if (sourceBuild != null) {
                sourceBuild.repository = repo;
                if (destinationBuild != null && destinationBuild.variables != null) {
                    let destinationKeys = Object.keys(destinationBuild.variables);
                    if (sourceBuild.variables != null) {
                        let sourceKeys = Object.keys(sourceBuild.variables);
                        if (destinationKeys.length == 0 && sourceKeys.length > 0) {
                            destinationBuild.variables = sourceBuild.variables;
                            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(util_1.default.format("Updating %s environment variables", destinationBuildName));
                            await client.updateDefinition(destinationBuild, destinationBuild.project.name, destinationBuild.id);
                            return;
                        }
                    }
                }
            }
        }
        if (destinationBuild != null) {
            return;
        }
        let defaultSettings = false;
        if (sourceBuild == null) {
            defaultSettings = true;
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Matching ${buildName} build not found, will apply default settings`);
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Applying default service connection. You will need to update settings with you environment teams`);
            sourceBuild = {};
            sourceBuild.repository = {};
            sourceBuild.repository.id = repo.id;
            sourceBuild.repository.name = repo.name;
            sourceBuild.repository.url = repo.url;
            sourceBuild.repository.type = 'TfsGit';
            let serviceConnectionName = '';
            let serviceConnectionUrl = '';
            let environmentTenantId = '';
            let environmentClientId = '';
            let environmentSecret = '';
            let environmentUrl = typeof (args.settings[buildName] === "string") ? args.settings[buildName] : "";
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info(`Environment URL: ${environmentUrl}`);
            serviceConnectionName = args.settings[`${buildName}-scname`];
            serviceConnectionUrl = environment_1.Environment.getEnvironmentUrl(environmentUrl, args.settings);
            (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info(`Service Connection URL: ${serviceConnectionUrl}`);
            //Fall back to using the service connection url supplied as the service connection name if no name was supplied
            if (typeof serviceConnectionName === "undefined" || serviceConnectionName == '') {
                serviceConnectionName = serviceConnectionUrl;
            }
            (_g = this.logger) === null || _g === void 0 ? void 0 : _g.debug(util_1.default.format("Environment Name %s", environmentName));
            (_h = this.logger) === null || _h === void 0 ? void 0 : _h.debug(util_1.default.format("Name %s", serviceConnectionName));
            (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug(util_1.default.format("URL %s", serviceConnectionUrl));
            sourceBuild.variables = {
                EnvironmentName: {},
                ServiceConnection: {},
                ServiceConnectionUrl: {}
            };
            sourceBuild.variables.EnvironmentName.value = environmentName;
            sourceBuild.variables.ServiceConnection.value = serviceConnectionName;
            sourceBuild.variables.ServiceConnectionUrl.value = serviceConnectionUrl;
        }
        (_k = this.logger) === null || _k === void 0 ? void 0 : _k.info(util_1.default.format("Creating new pipeline %s", destinationBuildName));
        var newBuild = {};
        newBuild.name = destinationBuildName;
        let process = {};
        process.yamlFilename = util_1.default.format("/%s/%s.yml", destination, destinationBuildName);
        newBuild.process = process;
        newBuild.path = "/" + destination;
        newBuild.repository = sourceBuild.repository;
        newBuild.repository.defaultBranch = createInBranch;
        newBuild.variables = sourceBuild.variables;
        if (sourceBuild.triggers != null) {
            newBuild.triggers = sourceBuild.triggers;
        }
        else {
            let trigger = {};
            trigger.triggerType = BuildInterfaces.DefinitionTriggerType.ContinuousIntegration;
            trigger.branchFilters = [];
            trigger.pathFilters = [];
            trigger.maxConcurrentBuildsPerBranch = 1;
            trigger.batchChanges = false;
            trigger.settingsSourceType = BuildInterfaces.DefinitionTriggerType.ContinuousIntegration;
            newBuild.triggers = [trigger];
        }
        if (sourceBuild.queue != null) {
            newBuild.queue = sourceBuild.queue;
        }
        else {
            newBuild.queue = defaultQueue;
        }
        let result;
        try {
            result = await client.createDefinition(newBuild, project.name);
        }
        catch (error) {
            (_l = this.logger) === null || _l === void 0 ? void 0 : _l.error(util_1.default.format("Error creating new pipeline definition results %s", error));
            throw error;
        }
        if (defaultSettings && args.openDefaultPages) {
            await open(`${baseUrl}/_build/${result === null || result === void 0 ? void 0 : result.id}`);
        }
    }
    async getGitCommitChanges(args, gitApi, pipelineRepo, destinationBranch, defaultBranch, names) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        let pipelineProject = ((_a = args.pipelineProject) === null || _a === void 0 ? void 0 : _a.length) > 0 ? args.pipelineProject : args.projectName;
        let results = [];
        let accessToken = ((_b = args.accessToken) === null || _b === void 0 ? void 0 : _b.length) > 0 ? args.accessToken : args.accessTokens["499b84ac-1321-427f-aa17-267ca6975798"];
        let config = {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };
        if (accessToken.length === 52) {
            config = {
                headers: {
                    'Authorization': `Basic ${Buffer.from(":" + accessToken).toString('base64')}`
                }
            };
        }
        for (var i = 0; i < names.length; i++) {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(util_1.default.format("Getting changes for %s", names[i]));
            let version = {};
            version.versionType = GitInterfaces_1.GitVersionType.Branch;
            let templatePath = util_1.default.format("/Pipelines/build-deploy-%s-SampleSolution.yml", names[i]);
            if (typeof args.settings[`${names[i]}-buildtemplate`] === "string") {
                templatePath = args.settings[`${names[i]}-buildtemplate`];
            }
            let contentUrl = `${args.organizationName}/${pipelineProject}/_apis/git/repositories/${args.pipelineRepository}/items?path=${templatePath}&includeContent=true&versionDescriptor.version=${this.withoutRefsPrefix(pipelineRepo.defaultBranch)}&versionDescriptor.versionType=branch&api-version=5.0`;
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(util_1.default.format("Getting content from %s", contentUrl));
            let response = await this.getUrl(contentUrl, config);
            if ((response === null || response === void 0 ? void 0 : response.content) != null) {
                let commit = {};
                commit.changeType = GitInterfaces_1.VersionControlChangeType.Add;
                commit.item = {};
                commit.item.path = util_1.default.format("/%s/deploy-%s-%s.yml", destinationBranch, names[i], destinationBranch);
                commit.newContent = {};
                commit.newContent.content = response === null || response === void 0 ? void 0 : response.content.toString().replace(/BranchContainingTheBuildTemplates/g, defaultBranch);
                commit.newContent.content = (_e = (commit.newContent.content)) === null || _e === void 0 ? void 0 : _e.replace(/RepositoryContainingTheBuildTemplates/g, `${pipelineProject}/${pipelineRepo.name}`);
                commit.newContent.content = (_f = (commit.newContent.content)) === null || _f === void 0 ? void 0 : _f.replace(/SampleSolutionName/g, destinationBranch);
                let variableGroup = args.settings[names[i] + "-variablegroup"];
                if (typeof variableGroup !== "undefined" && variableGroup != '') {
                    commit.newContent.content = (_g = (commit.newContent.content)) === null || _g === void 0 ? void 0 : _g.replace(/alm-accelerator-variable-group/g, variableGroup);
                }
                commit.newContent.contentType = GitInterfaces_1.ItemContentType.RawText;
                results.push(commit);
            }
            else {
                (_h = this.logger) === null || _h === void 0 ? void 0 : _h.info(`Error creating new pipeline definition for ${names[i]}: ${JSON.stringify(response)}`);
                throw response;
            }
        }
        return results;
    }
}
exports.DevOpsCommand = DevOpsCommand;
/**
 * Install Arguments
 */
class DevOpsInstallArguments {
    constructor() {
        this.extensions = [];
        this.environments = {};
        this.azureActiveDirectoryServicePrincipal = 'ALMAcceleratorServicePrincipal';
        this.accessTokens = {};
        this.createSecretIfNoExist = true;
        this.endpoint = "prod";
        this.settings = {};
    }
}
exports.DevOpsInstallArguments = DevOpsInstallArguments;
/**
 * Branch Arguments
 */
class DevOpsBranchArguments {
    constructor() {
        this.settings = {};
    }
}
exports.DevOpsBranchArguments = DevOpsBranchArguments;
//# sourceMappingURL=devops.js.map