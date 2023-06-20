import { Uri } from 'vscode';
import type { LocalWorkspaceFileData } from '../../../plus/workspaces/models';
import type { WorkspacesPathMappingProvider } from '../../../plus/workspaces/workspacesPathMappingProvider';

export class WorkspacesWebPathMappingProvider implements WorkspacesPathMappingProvider {
	async getCloudWorkspaceRepoPath(_cloudWorkspaceId: string, _repoId: string): Promise<string | undefined> {
		return undefined;
	}

	async getCloudWorkspaceCodeWorkspacePath(_cloudWorkspaceId: string): Promise<string | undefined> {
		return undefined;
	}

	async writeCloudWorkspaceRepoDiskPathToMap(
		_cloudWorkspaceId: string,
		_repoId: string,
		_repoLocalPath: string,
	): Promise<void> {}

	async getLocalWorkspaceData(): Promise<LocalWorkspaceFileData> {
		return { workspaces: {} };
	}

	async writeCodeWorkspaceFile(
		_uri: Uri,
		_workspaceRepoFilePaths: string[],
		_options?: { workspaceId?: string },
	): Promise<boolean> {
		return false;
	}

	async confirmCloudWorkspaceCodeWorkspaceFileMatch(
		_cloudWorkspaceId: string,
		_codeWorkspaceFilePath: string,
	): Promise<boolean> {
		return false;
	}
}
