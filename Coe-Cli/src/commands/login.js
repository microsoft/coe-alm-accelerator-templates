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
exports.LoginCommand = exports.LoginArguments = void 0;
const msal_node_1 = require("@azure/msal-node");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const util_1 = require("util");
const child_process_1 = require("child_process");
const prompt_1 = require("../common/prompt");
const environment_1 = require("../../src/common/environment");
const readFile = (0, util_1.promisify)(fs.readFile);
/**
* Azure Active Directory Login Commands
*/
class LoginCommand {
    constructor(logger) {
        this.logger = logger;
        this.createClientApp = (config) => {
            return new msal_node_1.PublicClientApplication(config);
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
    }
    /**
     * Login to Azure DevOps
     *
     * @param args {LoginArguments} - The login arguments
     * @return {Promise} aync outcome
     *
     */
    async execute(args, settings) {
        var _a;
        var config = undefined;
        if (((_a = args === null || args === void 0 ? void 0 : args.configFile) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            let configFile = path.isAbsolute(args === null || args === void 0 ? void 0 : args.configFile) ? args === null || args === void 0 ? void 0 : args.configFile : path.join(process.cwd(), args === null || args === void 0 ? void 0 : args.configFile);
            let json = await readFile(configFile, 'utf8');
            config = JSON.parse(json);
        }
        if (typeof config === "undefined") {
            let authEndpoint = environment_1.Environment.getAzureADAuthEndpoint(settings);
            let clientId = args.clientId;
            config = {
                "authOptions": {
                    "clientId": clientId,
                    "authority": authEndpoint + "/common/"
                },
                "request": {
                    "deviceCodeUrlParameters": {
                        "scopes": ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"]
                    }
                },
                "resourceApi": {
                    "endpoint": "https://dev.azure.com"
                }
            };
        }
        // Build MSAL Client Configuration from scenario configuration file
        const clientConfig = {
            auth: config.authOptions
        };
        let runtimeOptions;
        if (!runtimeOptions) {
            runtimeOptions = {
                deviceCodeCallback: (response) => console.log(response.message)
            };
        }
        let deviceCodeRequest = {
            ...config.request.deviceCodeUrlParameters,
            deviceCodeCallback: (response) => console.log(response.message)
        };
        // Check if a timeout was provided at runtime.
        if (runtimeOptions === null || runtimeOptions === void 0 ? void 0 : runtimeOptions.timeout) {
            deviceCodeRequest.timeout = runtimeOptions.timeout;
        }
        return this.login(clientConfig, deviceCodeRequest);
    }
    async azureLogin(scopes) {
        let results = {};
        let validated = false;
        while (!validated) {
            let accounts;
            try {
                accounts = JSON.parse(this.runCommand('az account list', false));
            }
            catch (_a) {
                accounts = [];
            }
            // Check if accounts
            if (accounts.length == 0) {
                // No accounts are available probably not logged in ... prompt to login
                let ok = await this.prompt.yesno('You are not logged into an account. Try login now (Y/n)?', true);
                if (ok) {
                    this.runCommand('az login --use-device-code --allow-no-subscriptions', true);
                }
            }
            if (accounts.length > 0) {
                this.runCommand('az account show', true);
                validated = true;
                for (var i = 0; i < scopes.length; i++) {
                    this.logger.info(`Get access token for scope ${scopes[i]}`);
                    let token = JSON.parse(this.runCommand(`az account get-access-token --resource ${scopes[i]}`, false));
                    results[scopes[i]] = token.accessToken;
                }
            }
        }
        return results;
    }
    async login(clientConfig, deviceCodeRequest) {
        var self = this;
        const pca = this.createClientApp(clientConfig);
        /**
         * MSAL Usage
         * The code below demonstrates the correct usage pattern of the ClientApplicaiton.acquireTokenByDeviceCode API.
         *
         * Device Code Grant
         *
         * In this code block, the application uses MSAL to obtain an Access Token through the Device Code grant.
         * Once the device code request is executed, the user will be prompted by the console application to visit a URL,
         * where they will input the device code shown in the console. Once the code is entered, the promise below should resolve
         * with an AuthenticationResult object.
         *
         * The AuthenticationResult contains an `accessToken` property. Said property contains a string representing an encoded Json Web Token
         * which can be added to the `Authorization` header in a protected resource request to demonstrate authorization.
         */
        return await pca.acquireTokenByDeviceCode(deviceCodeRequest)
            .then((response) => {
            self.accessToken = response.accessToken;
            return response;
        }).catch((error) => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.error(error);
            return error;
        });
    }
}
exports.LoginCommand = LoginCommand;
/**
 * Login Arguments
 */
class LoginArguments {
}
exports.LoginArguments = LoginArguments;
//# sourceMappingURL=login.js.map