import type { MessageItem } from 'vscode';
import { env, Uri, window } from 'vscode';
import type { Container } from '../container';
import { isSubscriptionPaidPlan, isSubscriptionPreviewTrialExpired } from './gk/account/subscription';

export async function ensurePaidPlan(
	container: Container,
	title: string,
	options?: { allowPreview?: boolean },
): Promise<boolean> {
	while (true) {
		const subscription = await container.subscription.getSubscription();
		if (subscription.account?.verified === false) {
			const resend = { title: 'Resend Email' };
			const cancel = { title: 'Cancel', isCloseAffordance: true };
			const result = await window.showWarningMessage(
				`${title}\n\nYou must verify your email before you can continue.`,
				{ modal: true },
				resend,
				cancel,
			);

			if (result === resend) {
				if (await container.subscription.resendVerification()) {
					continue;
				}
			}

			return false;
		}

		const plan = subscription.plan.effective.id;
		if (isSubscriptionPaidPlan(plan)) break;

		if (options?.allowPreview && subscription.account == null && !isSubscriptionPreviewTrialExpired(subscription)) {
			const startTrial = { title: 'Continue' };
			const cancel = { title: 'Cancel', isCloseAffordance: true };
			const result = await window.showWarningMessage(
				`${title}\n\nDo you want to continue to get immediate access to preview local Pro features for 3 days?`,
				{ modal: true },
				startTrial,
				cancel,
			);

			if (result !== startTrial) return false;

			void container.subscription.startPreviewTrial();
			break;
		} else if (subscription.account == null) {
			const signUp = { title: 'Start Pro Trial' };
			const signIn = { title: 'Sign In' };
			const cancel = { title: 'Cancel', isCloseAffordance: true };
			const result = await window.showWarningMessage(
				`${title}\n\nDo you want to start your free 7-day Pro trial for full access to Pro features?`,
				{ modal: true },
				signUp,
				signIn,
				cancel,
			);

			if (result === signUp || result === signIn) {
				if (await container.subscription.loginOrSignUp(result === signUp)) {
					continue;
				}
			}
		} else {
			const upgrade = { title: 'Upgrade to Pro' };
			const cancel = { title: 'Cancel', isCloseAffordance: true };
			const result = await window.showWarningMessage(
				`${title}\n\nDo you want to upgrade for full access to Pro features?`,
				{ modal: true },
				upgrade,
				cancel,
			);

			if (result === upgrade) {
				void container.subscription.purchase();
			}
		}

		return false;
	}

	return true;
}

export async function ensureAccount(title: string, container: Container): Promise<boolean> {
	while (true) {
		const subscription = await container.subscription.getSubscription();
		if (subscription.account?.verified === false) {
			const resend = { title: 'Resend Email' };
			const cancel = { title: 'Cancel', isCloseAffordance: true };
			const result = await window.showWarningMessage(
				`${title}\n\nYou must verify your email before you can continue.`,
				{ modal: true },
				resend,
				cancel,
			);

			if (result === resend) {
				if (await container.subscription.resendVerification()) {
					continue;
				}
			}

			return false;
		}

		if (subscription.account != null) break;

		const signUp = { title: 'Sign Up' };
		const signIn = { title: 'Sign In' };
		const cancel = { title: 'Cancel', isCloseAffordance: true };
		const result = await window.showWarningMessage(
			`${title}\n\nSign up for access to Pro features and our DevEx platform, or sign in`,
			{ modal: true },
			signUp,
			signIn,
			cancel,
		);

		if (result === signIn) {
			if (await container.subscription.loginOrSignUp(false)) {
				continue;
			}
		} else if (result === signUp) {
			if (await container.subscription.loginOrSignUp(true)) {
				continue;
			}
		}

		return false;
	}

	return true;
}

export async function confirmDraftStorage(container: Container): Promise<boolean> {
	if (container.storage.get('confirm:draft:storage', false)) return true;

	while (true) {
		const accept: MessageItem = { title: 'Continue' };
		const decline: MessageItem = { title: 'Cancel', isCloseAffordance: true };
		const moreInfo: MessageItem = { title: 'Learn More' };
		const security: MessageItem = { title: 'Security' };
		const result = await window.showInformationMessage(
			`Cloud Patches are securely stored by GitKraken and can be accessed by anyone with the link and a GitKraken account.`,
			{ modal: true },
			accept,
			moreInfo,
			security,
			decline,
		);

		if (result === accept) {
			void container.storage.store('confirm:draft:storage', true);
			return true;
		}

		if (result === security) {
			void env.openExternal(Uri.parse('https://help.gitkraken.com/gitlens/security'));
			continue;
		}

		if (result === moreInfo) {
			void env.openExternal(Uri.parse('https://www.gitkraken.com/solutions/cloud-patches'));
			continue;
		}

		return false;
	}
}
