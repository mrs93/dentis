import type { Disposable, Uri, UriHandler } from 'vscode';
import { EventEmitter, window } from 'vscode';
import type { Container } from '../container';
import type { DeepLinkType } from '../deepLink/deepLink';
import { DeepLinkTypes } from '../deepLink/deepLink';
import { log } from '../system/decorators/log';
import type { DeepLinkUriEvent, UriEvent } from './uri';
import { UriTypes } from './uri';

// This service is in charge of registering a URI handler and handling/emitting URI events received by GitLens.
// URI events to GitLens take the form of: vscode://eamodio.gitlens/... and are handled by the UriEventHandler.
// The UriEventHandler is responsible for parsing the URI and emitting the event to the UriService.
export class UriService implements Disposable {
	private _disposable: Disposable;
	private _uriHandler: UriEventHandler;

	// TODO: Figure out how to set up the disposable properly.
	constructor(private readonly container: Container) {
		this._uriHandler = new UriEventHandler();
		this._disposable = window.registerUriHandler(this._uriHandler);
	}

	getUriHandler() {
		return this._uriHandler;
	}

	dispose() {
		this._disposable.dispose();
	}
}

export class UriEventHandler extends EventEmitter<UriEvent> implements UriHandler {
	// Strip query strings from the Uri to avoid logging token, etc
	@log<UriEventHandler['handleUri']>({ args: { 0: u => u.with({ query: '' }).toString(true) } })
	handleUri(uri: Uri) {
		void window.showInformationMessage(`URI handler called: ${uri.toString()}`);
		const uriSplit = uri.path.split('/');
		if (uriSplit.length < 2) return;
		const uriType = uriSplit[1];
		if (uriType !== UriTypes.Auth && uriType !== UriTypes.DeepLink) return;
		if (uriType === UriTypes.Auth) {
			this.fire({ type: UriTypes.Auth, uri: uri });
			return;
		}

		if (uriType === UriTypes.DeepLink) {
			const deepLinkEvent: DeepLinkUriEvent | null = this.formatDeepLinkUriEvent(uri);
			if (deepLinkEvent) {
				this.fire(deepLinkEvent);
			}
		}
	}

	// Set up a deep link event based on the following specifications:
	// 1. Remote link type: /repolink/{repoId}?url={remoteUrl}
	// 2. Branch link type: /repolink/{repoId}/branch/{branchName}?url={remoteUrl}
	// 3. Tag link type: /repolink/{repoId}/tag/{tagName}?url={remoteUrl}
	// 4. Commit link type: /repolink/{repoId}/commit/{commitSha}?url={remoteUrl}
	// If the url does not fit any of the above specifications, return null
	// If the url does fit one of the above specifications, return the deep link event
	formatDeepLinkUriEvent(uri: Uri): DeepLinkUriEvent | null {
		const uriSplit = uri.path.split('/');
		if (uriSplit.length < 2) return null;
		const uriType = uriSplit[1];
		if (uriType !== UriTypes.DeepLink) return null;
		const repoId = uriSplit[2];
		const remoteUrl = parseQuery(uri).url;
		if (!repoId || !remoteUrl) return null;
		if (uriSplit.length === 3) {
			return {
				type: UriTypes.DeepLink,
				linkType: DeepLinkTypes.Remote,
				uri: uri,
				repoId: repoId,
				remoteUrl: remoteUrl,
			};
		}

		if (uriSplit.length < 5) return null;
		const linkTarget = uriSplit[3];
		const linkTargetId = uriSplit[4];

		return {
			type: UriTypes.DeepLink,
			linkType: linkTarget as DeepLinkType,
			uri: uri,
			repoId: repoId,
			remoteUrl: remoteUrl,
			targetId: linkTargetId,
		};
	}
}

function parseQuery(uri: Uri): Record<string, string> {
	return uri.query.split('&').reduce<Record<string, string>>((prev, current) => {
		const queryString = current.split('=');
		prev[queryString[0]] = queryString[1];
		return prev;
	}, {});
}
