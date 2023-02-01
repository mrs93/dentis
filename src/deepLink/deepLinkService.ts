import type { Disposable } from 'vscode';
import { window } from 'vscode';
import { Commands } from '../constants';
import type { Container } from '../container';
import { GitReference } from '../git/models/reference';
import type { GitRemote } from '../git/models/remote';
import type { ShowInCommitGraphCommandArgs } from '../plus/webviews/graph/graphWebview';
import { executeCommand } from '../system/command';
import type { UriEvent } from '../uri/uri';
import { UriTypes } from '../uri/uri';
import type { DeepLinkServiceContext } from './deepLink';
import { DeepLinkServiceAction, DeepLinkServiceState, deepLinkStateTransitionTable, DeepLinkType } from './deepLink';

export class DeepLinkService implements Disposable {
	private _disposable: Disposable;
	private _context: DeepLinkServiceContext;

	constructor(private readonly container: Container) {
		this._context = {
			state: DeepLinkServiceState.Idle,
		};

		this._disposable = container.uri.onDidReceiveUri(async (event: UriEvent) => {
			if (event.type === UriTypes.DeepLink && this._context.state === DeepLinkServiceState.Idle) {
				if (!event.repoId || !event.linkType || !event.uri || !event.remoteUrl) {
					void window.showErrorMessage(`Error resolving deep link: missing required properties.`);
					return;
				}

				if (!Object.values(DeepLinkType).includes(event.linkType)) {
					void window.showErrorMessage(`Error resolving deep link: unknown link type.`);
					return;
				}

				if (event.linkType !== DeepLinkType.Remote && !event.targetId) {
					void window.showErrorMessage(
						`Error resolving deep link of type ${event.linkType}: no target id provided.`,
					);
					return;
				}

				this._context = {
					...this._context,
					repoId: event.repoId,
					targetType: event.linkType,
					uri: event.uri,
					remoteUrl: event.remoteUrl,
					targetId: event.targetId,
				};

				await this.processDeepLink();
			}
		});
	}

	resetContext() {
		this._context = {
			state: DeepLinkServiceState.Idle,
			uri: undefined,
			repoId: undefined,
			repo: undefined,
			remoteUrl: undefined,
			remote: undefined,
			targetId: undefined,
			targetType: undefined,
			targetSha: undefined,
		};
	}

	dispose() {
		this._disposable.dispose();
	}

	async getShaForTarget(): Promise<string | undefined> {
		const { repo, remote, targetType, targetId } = this._context;
		if (!repo || !remote || targetType === DeepLinkType.Remote || !targetId) {
			return undefined;
		}

		if (targetType === DeepLinkType.Branch) {
			// Form the target branch name using the remote name and branch name
			const branchName = `${remote.name}/${targetId}`;
			const branch = await repo.getBranch(branchName);
			if (branch) {
				return branch.sha;
			}

			return undefined;
		}

		if (targetType === DeepLinkType.Tag) {
			const tag = await repo.getTag(targetId);
			if (tag) {
				return tag.sha;
			}

			return undefined;
		}

		if (targetType === DeepLinkType.Commit) {
			if (await this.container.git.validateReference(repo.path, targetId)) {
				return targetId;
			}

			return undefined;
		}

		return undefined;
	}

	async processDeepLink(): Promise<void> {
		let message = '';
		let matchingRemotes: GitRemote[] = [];
		let action: DeepLinkServiceAction = DeepLinkServiceAction.DeepLinkEventFired;
		while (true) {
			this._context.state = deepLinkStateTransitionTable[this._context.state][action];
			const { state, repoId, repo, uri, remoteUrl, remote, targetSha, targetType } = this._context;
			switch (state) {
				case DeepLinkServiceState.Idle:
					if (action === DeepLinkServiceAction.DeepLinkResolved) {
						void window.showInformationMessage(`Deep link resolved: ${uri?.toString()}`);
						// TODO@ramint Add the ability to cancel deep link processing
						// } else if (action === DeepLinkServiceActions.DeepLinkCancelled) {
						//	void window.showInformationMessage(`Deep link cancelled: ${uri?.toString()}`);
					} else if (action === DeepLinkServiceAction.DeepLinkErrored) {
						void window.showErrorMessage(`Error resolving deep link: ${message ?? 'unknown error'}`);
					}

					// Deep link processing complete. Reset the context and return.
					this.resetContext();
					return;
				case DeepLinkServiceState.RepoMatch:
				case DeepLinkServiceState.AddedRepoMatch:
					if (!repoId) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'No repo id was provided.';
						break;
					}

					// Try to match a repo using the remote URL first, since that saves us some steps.
					// As a fallback, try to match using the repo id.
					for (const repo of this.container.git.repositories) {
						matchingRemotes = await repo.getRemotes({ filter: r => r.url === remoteUrl });
						if (matchingRemotes.length > 0) {
							this._context.repo = repo;
							this._context.remote = matchingRemotes[0];
							action = DeepLinkServiceAction.RepoMatchedWithRemoteUrl;
							break;
						}

						// Repo ID can be any valid SHA in the repo, though standard practice is to use the
						// first commit SHA.
						if (await this.container.git.validateReference(repo.path, repoId)) {
							this._context.repo = repo;
							action = DeepLinkServiceAction.RepoMatchedWithId;
							break;
						}
					}

					if (!this._context.repo) {
						if (state === DeepLinkServiceState.RepoMatch) {
							action = DeepLinkServiceAction.RepoMatchFailed;
						} else {
							action = DeepLinkServiceAction.DeepLinkErrored;
							message = 'No matching repo found.';
						}
					}

					break;

				case DeepLinkServiceState.CloneOrAddRepo:
					if (!repoId || !remoteUrl) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo id or remote url.';
						break;
					}

					// TODO@ramint Instead of erroring, prompt the user to clone or add the repo, wait for the response,
					// and then choose an action based on whether the repo is successfully cloned/added, of the user
					// cancels, or if there is an error.
					action = DeepLinkServiceAction.DeepLinkErrored;
					message = 'No matching repo found.';
					break;

				case DeepLinkServiceState.RemoteMatch:
					if (!repo || !remoteUrl) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo or remote url.';
						break;
					}

					matchingRemotes = await repo.getRemotes({ filter: r => r.url === remoteUrl });
					if (matchingRemotes.length > 0) {
						this._context.remote = matchingRemotes[0];
						action = DeepLinkServiceAction.RemoteMatched;
						break;
					}

					if (!this._context.remote) {
						action = DeepLinkServiceAction.RemoteMatchFailed;
					}

					break;

				case DeepLinkServiceState.AddRemote:
					if (!repo || !remoteUrl) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo or remote url.';
						break;
					}

					// TODO@ramint Instead of erroring here, prompt the user to add the remote, wait for the response,
					// and then choose an action based on whether the remote is successfully added, of the user
					// cancels, or if there is an error.
					action = DeepLinkServiceAction.DeepLinkErrored;
					message = 'No matching remote found.';
					break;

				case DeepLinkServiceState.TargetMatch:
				case DeepLinkServiceState.FetchedTargetMatch:
					if (!repo || !remote || !targetType) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo, remote, or target type.';
						break;
					}

					if (targetType === DeepLinkType.Remote) {
						action = DeepLinkServiceAction.TargetMatched;
						break;
					}

					this._context.targetSha = await this.getShaForTarget();
					if (!this._context.targetSha) {
						if (state === DeepLinkServiceState.TargetMatch) {
							action = DeepLinkServiceAction.TargetMatchFailed;
						} else {
							action = DeepLinkServiceAction.DeepLinkErrored;
							message = 'No matching target found.';
						}
						break;
					}

					action = DeepLinkServiceAction.TargetMatched;
					break;

				case DeepLinkServiceState.Fetch:
					if (!repo || !remote) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo or remote.';
						break;
					}

					// TODO@ramint Instead of erroring here, prompt the user to fetch, wait for the response,
					// and then choose an action based on whether the fetch was successful, of the user
					// cancels, or if there is an error.
					action = DeepLinkServiceAction.DeepLinkErrored;
					message = 'No matching target found.';
					break;

				case DeepLinkServiceState.OpenGraph:
					if (!repo || !targetType) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = 'Missing repo or target type.';
						break;
					}

					if (targetType === DeepLinkType.Remote) {
						void executeCommand(Commands.ShowGraphPage, repo);
						action = DeepLinkServiceAction.DeepLinkResolved;
						break;
					}

					if (!targetSha) {
						action = DeepLinkServiceAction.DeepLinkErrored;
						message = `Cannot find target ${targetType} in repo.`;
						break;
					}

					void (await executeCommand<ShowInCommitGraphCommandArgs>(Commands.ShowInCommitGraph, {
						ref: GitReference.create(targetSha, repo.path),
					}));

					action = DeepLinkServiceAction.DeepLinkResolved;
					break;

				default:
					action = DeepLinkServiceAction.DeepLinkErrored;
					message = 'Unknown state.';
					break;
			}
		}
	}
}
