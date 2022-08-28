"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AADCommand = exports.AADAppInstallArguments = void 0;
const path = require("path");
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const prompt_1 = require("../common/prompt");
/**
 * ALM Accelereator for Makers commands
 */
class AADCommand {
    constructor(logger) {
        this.logger = logger;
        this.runCommand = (command, displayOutput) => {
            if (displayOutput) {
                return (0, child_process_1.execSync)(command, { stdio: 'inherit', encoding: 'utf8' });
            }
            else {
                return (0, child_process_1.execSync)(command, { encoding: 'utf8' });
            }
        };
        this.getAxios = () => axios_1.default;
        this.prompt = new prompt_1.Prompt();
    }
    getAADGroup(args) {
        let json = this.runCommand(`az ad group list --display-name "${args.azureActiveDirectoryMakersGroup}"`, false);
        let groups = JSON.parse(json);
        if (groups.length > 0) {
            return groups[0].id;
        }
        return null;
    }
    /**
     * Install AAD Group
     * @param args
     * @returns
     */
    installAADGroup(args) {
        var _a, _b, _c, _d;
        if (((_a = args.azureActiveDirectoryMakersGroup) === null || _a === void 0 ? void 0 : _a.length) == 0) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info('Skipping group create');
            return null;
        }
        let group = this.getAADGroup(args);
        if (group === null) {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating ${args.azureActiveDirectoryMakersGroup} group`);
            let createJson = this.runCommand(`az ad group create --display-name "${args.azureActiveDirectoryMakersGroup}" --description "Application Lifecycle Management Accelerator for Makers" --mail-nickname="null"`, false);
            group = JSON.parse(createJson).id;
        }
        else {
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info(`Group ${args.azureActiveDirectoryMakersGroup} exists`);
        }
        return group;
    }
    getAADApplication(args) {
        let app = JSON.parse(this.runCommand(`az ad app list --filter "displayName eq '${args.azureActiveDirectoryServicePrincipal}'"`, false));
        if (app.length > 0) {
            return app[0].appId;
        }
        return null;
    }
    /**
     * Add user to group
     * @param user The object ID of the contact, group, user, or service principal.
     * @param azureActiveDirectoryMakersGroup Group's object id or display name(prefix also works if there is a unique match).
     */
    addUserToGroup(user, azureActiveDirectoryMakersGroup) {
        var _a, _b, _c, _d;
        let userInfo = JSON.parse(this.runCommand(`az ad user show --id ${user}`, false));
        if (typeof userInfo === "object" && typeof userInfo.id === "string") {
            let result = JSON.parse(this.runCommand(`az ad group member check --group ${azureActiveDirectoryMakersGroup} --member-id ${userInfo.id}`, false));
            let exists = (result.value == true);
            if (!exists) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Add ${userInfo.id} to ${azureActiveDirectoryMakersGroup}`);
                this.runCommand(`az ad group member add --group ${azureActiveDirectoryMakersGroup} --member-id ${userInfo.id}`, false);
            }
            else {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`User exists in ${azureActiveDirectoryMakersGroup}`);
            }
        }
        else {
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Unable add user to ${azureActiveDirectoryMakersGroup}`);
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(userInfo);
        }
    }
    /**
     * Create the service principal required to manage solutions between Azure DevOps and the Power Platform environments
     * @param args
     * @returns
     */
    async installAADApplication(args) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (await this.validateAzCliReady(args)) {
            let manifest = path.join(__dirname, '..', '..', '..', 'config', 'manifest.json');
            // Find if application has been created already
            let app = JSON.parse(this.runCommand(`az ad app list --filter "displayName eq '${args.azureActiveDirectoryServicePrincipal}'"`, false));
            if (app.length == 0) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`Creating application ${args.azureActiveDirectoryServicePrincipal}`);
                let createCommand = `az ad app create --display-name "${args.azureActiveDirectoryServicePrincipal}" --sign-in-audience AzureADMyOrg --required-resource-accesses "${manifest}"`;
                let appCreateText = this.runCommand(createCommand, false);
                let appCreate = JSON.parse(appCreateText);
                if (typeof appCreate.Error !== "undefined") {
                    this.logger.error(appCreate.Error);
                }
                app = JSON.parse(this.runCommand(`az ad app list --filter "displayName eq '${args.azureActiveDirectoryServicePrincipal}'"`, false));
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info("Creating application service principal");
                this.runCommand(`az ad sp create --id ${app[0].appId}`, false);
            }
            if (app.length > 0) {
                this.logger.info("Application exists");
                let permissions;
                let waiting = true;
                let attempt = 0;
                while (waiting) {
                    if (attempt > 60) {
                        break;
                    }
                    try {
                        permissions = JSON.parse(this.runCommand(`az ad app permission list-grants --id ${app[0].appId}`, false));
                        if ((permissions === null || permissions === void 0 ? void 0 : permissions.length) >= 0) {
                            break;
                        }
                    }
                    catch (_l) {
                    }
                    (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Waiting attempt ${attempt}`);
                    await this.sleep(1000);
                    attempt++;
                }
                if ((permissions === null || permissions === void 0 ? void 0 : permissions.length) < 3) {
                    this.logger.info("Administration grant not set");
                    (_d = this.logger) === null || _d === void 0 ? void 0 : _d.info("Granting Azure DevOps delegated admin consent");
                    this.grantAdminDelegatedPermissions(app[0].appId, '499b84ac-1321-427f-aa17-267ca6975798', 'ee69721e-6c3a-468f-a9ec-302d16a4c599');
                    (_e = this.logger) === null || _e === void 0 ? void 0 : _e.info("Granting PowerApps-Advisor delegated admin consent");
                    this.grantAdminDelegatedPermissions(app[0].appId, 'c9299480-c13a-49db-a7ae-cdfe54fe0313', 'd533b86d-8f67-45f0-b8bb-c0cee8da0356');
                    (_f = this.logger) === null || _f === void 0 ? void 0 : _f.info("Granting Dynamics CRM delegated admin consent");
                    this.grantAdminDelegatedPermissions(app[0].appId, '00000007-0000-0000-c000-000000000000', '78ce3f0f-a1ce-49c2-8cde-64b5c0896db4');
                    try {
                        permissions = JSON.parse(this.runCommand(`az ad app permission list-grants --id ${app[0].appId}`, false));
                    }
                    catch (_m) {
                    }
                }
                if ((permissions === null || permissions === void 0 ? void 0 : permissions.length) >= 3) {
                    (_g = this.logger) === null || _g === void 0 ? void 0 : _g.info("Admin permissions granted");
                }
                else {
                    this.logger.info("Unable to verify that Administration permissions set");
                }
                let match = 0;
                (_h = app[0].web.redirectUris) === null || _h === void 0 ? void 0 : _h.forEach((u) => {
                    if (u == "https://global.consent.azure-apim.net/redirect") {
                        match++;
                    }
                });
                if (app[0].web.redirectUris.length == 0 || match == 0) {
                    (_j = this.logger) === null || _j === void 0 ? void 0 : _j.debug('Adding reply url https://global.consent.azure-apim.net/redirect');
                    this.runCommand(`az ad app update --id ${app[0].appId} --web-redirect-uris https://global.consent.azure-apim.net/redirect`, true);
                }
            }
            else {
                (_k = this.logger) === null || _k === void 0 ? void 0 : _k.info(`Application ${args.azureActiveDirectoryServicePrincipal} not found`);
                return Promise.resolve();
            }
        }
    }
    grantAdminDelegatedPermissions(appId, apiId, scope) {
        var _a;
        // https://github.com/Azure/azure-cli/issues/12137#issuecomment-596567479
        let result = this.runCommand(`az ad app permission grant --id ${appId} --api ${apiId} --scope ${scope}`, false);
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(result);
    }
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    /**
     * Add a secret to an existing AAD application
     * @param args
     * @returns
     */
    async addSecret(args, name) {
        var _a, _b, _c;
        if (await this.validateAzCliReady(args)) {
            let result = {};
            let accounts = JSON.parse(this.runCommand(`az account list --query [?isDefault]`, false));
            result.tenantId = accounts[0].tenantId;
            let apps = JSON.parse(this.runCommand(`az ad app list --filter "displayName eq '${args.azureActiveDirectoryServicePrincipal}'"`, false));
            if (apps.length > 0) {
                result.clientId = apps[0].appId;
                let suffix = '';
                let match = 0;
                (_a = apps[0].passwordCredentials) === null || _a === void 0 ? void 0 : _a.forEach((element) => {
                    var _a;
                    if ((_a = element.displayName) === null || _a === void 0 ? void 0 : _a.startsWith(name)) {
                        match++;
                    }
                });
                if (match > 0) {
                    suffix = `-${(match + 1).toString()}`;
                }
                if (args.createSecret) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`Creating AAD password for ${args.azureActiveDirectoryServicePrincipal}`);
                    name = `${name}${suffix}`;
                    (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info(`Creating secret for ${name}`);
                    let creds = JSON.parse(this.runCommand(`az ad app credential reset --id ${apps[0].appId} --append --display-name ${name}`, false));
                    result.clientSecret = creds.password;
                    result.tenantId = creds.tenant;
                }
            }
            return Promise.resolve(result);
        }
    }
    async validateAzCliReady(args) {
        var _a, _b, _c;
        let validated = false;
        while (!validated) {
            let accounts;
            try {
                accounts = JSON.parse(this.runCommand('az account list', false));
            }
            catch (_d) {
                accounts = [];
            }
            // Check if tenant assigned
            if (typeof (args.subscription) == "undefined" || (args.subscription.length == 0)) {
                if (accounts.length == 0) {
                    // No accounts are available probably not logged in ... prompt to login
                    let ok = await this.prompt.yesno('You are not logged into an account. Try login now (y/n)?', true);
                    if (ok) {
                        this.runCommand('az login --use-device-code --allow-no-subscriptions', true);
                    }
                    else {
                        return Promise.resolve(false);
                    }
                }
                if (accounts.length > 0) {
                    let defaultAccount = accounts.filter((a) => (a.isDefault));
                    if (accounts.length == 1) {
                        // Only one subscription assigned to the user account use that
                        args.subscription = accounts[0].id;
                    }
                    if (defaultAccount.length == 1 && accounts.length > 1) {
                        // More than one account assigned to this account .. confirm if want to use the current default tenant
                        let ok = await this.prompt.yesno(`Use default tenant ${defaultAccount[0].tenantId} in account ${defaultAccount[0].name} (y/n)?`, true);
                        if (ok) {
                            // Use the default account
                            args.subscription = defaultAccount[0].id;
                        }
                    }
                    if (typeof (args.subscription) == "undefined" || (args.subscription.length == 0)) {
                        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info("Missing subscription, run az account list to and it -a argument to assign the default subscription/account");
                        return Promise.resolve(false);
                    }
                }
            }
            if (accounts.length > 0) {
                let match = accounts.filter((a) => (a.id == args.subscription || a.name == args.subscription) && (a.isDefault));
                if (match.length != 1) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.info(`${args.subscription} is not the default account. Check you have run az login and have selected the correct default account using az account set --subscription`);
                    (_c = this.logger) === null || _c === void 0 ? void 0 : _c.info('Read more https://docs.microsoft.com/cli/azure/account?view=azure-cli-latest#az_account_set');
                    return Promise.resolve(false);
                }
                else {
                    return Promise.resolve(true);
                }
            }
        }
    }
}
exports.AADCommand = AADCommand;
/**
 * Azure Active Directory User Arguments
 */
class AADAppInstallArguments {
    constructor() {
        this.accessTokens = {};
        this.settings = {};
    }
}
exports.AADAppInstallArguments = AADAppInstallArguments;
//# sourceMappingURL=aad.js.map