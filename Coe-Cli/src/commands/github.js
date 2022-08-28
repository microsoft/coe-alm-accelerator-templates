"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubCommand = exports.GitHubReleaseArguments = void 0;
const { Octokit } = require("@octokit/rest");
const config_1 = require("../common/config");
/**
 * Github commands
 */
class GitHubCommand {
    constructor(logger) {
        this.config = {};
        this.logger = logger;
        this.createOctoKitRepos = (auth) => {
            if ((auth === null || auth === void 0 ? void 0 : auth.length) > 0) {
                return new Octokit({ auth: auth }).rest.repos;
            }
            return new Octokit().rest.repos;
        };
        this.config = config_1.Config.data;
        this.octokitRequest = async (request) => {
            let octokit = new Octokit();
            return await octokit.request(request);
        };
    }
    /**
     * Execute the command
     * @param args
     * @returns
     */
    async getRelease(args, repo) {
        var _a, _b;
        let octokitRepo = this.createOctoKitRepos(this.config["pat"]);
        try {
            let results = await octokitRepo.listReleases({
                owner: 'microsoft',
                repo: repo,
            });
            let releaseName = '';
            switch (args.type) {
                case 'coe':
                    releaseName = 'CoE Starter Kit';
                    break;
                case 'alm':
                    releaseName = 'ALM Accelerator For Power Platform';
                    break;
                default: {
                    // Use the defined release type as the release name
                    releaseName = args.type;
                }
            }
            let coeRelease = results.data.filter((r) => r.name.indexOf(releaseName) >= 0);
            if (((_a = args.settings["installFile"]) === null || _a === void 0 ? void 0 : _a.length) > 0 && args.settings["installFile"].startsWith("https://")) {
                coeRelease = results.data.filter((r) => r.html_url == args.settings["installFile"]);
            }
            if (coeRelease.length > 0) {
                if (args.asset == 'Source Code (zip)') {
                    return coeRelease[0].zipball_url;
                }
                else {
                    let asset = coeRelease[0].assets.filter((a) => a.name.indexOf(args.asset) >= 0);
                    if (asset.length > 0) {
                        let headers = null;
                        if (((_b = this.config["pat"]) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                            headers = {
                                authorization: `token ${this.config["pat"]}`,
                                accept: 'application/octet-stream'
                            };
                        }
                        else {
                            headers = {
                                accept: 'application/octet-stream'
                            };
                        }
                        let download = await this.octokitRequest({
                            url: '/repos/{owner}/{repo}/releases/assets/{asset_id}',
                            headers: headers,
                            owner: 'microsoft',
                            repo: repo,
                            asset_id: asset[0].id
                        });
                        const buffer = Buffer.from(download.data);
                        return 'base64:' + buffer.toString('base64');
                    }
                }
                throw Error("Release not found");
            }
        }
        catch (ex) {
            this.logger.error(ex);
        }
    }
    getAccessToken(args) {
        var _a;
        if (((_a = config_1.Config.data["pat"]) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            return `token ${config_1.Config.data["pat"]}`;
        }
        return "";
    }
}
exports.GitHubCommand = GitHubCommand;
/**
 * Github Release Command Arguments
 */
class GitHubReleaseArguments {
}
exports.GitHubReleaseArguments = GitHubReleaseArguments;
//# sourceMappingURL=github.js.map