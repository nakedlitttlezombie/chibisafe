import process from 'node:process';
import type { FastifyReply } from 'fastify';
import { getHtmlBuffer } from '@/main.js';
import prisma from '@/structures/database.js';
import type { RequestWithUser } from '@/structures/interfaces.js';
import type { SETTINGS } from '@/structures/settings.js';
import { loadSettings } from '@/structures/settings.js';
import { updateCheck, startUpdateCheckSchedule, stopUpdateCheckSchedule } from '@/utils/UpdateCheck.js';

export const options = {
	url: '/admin/service/settings',
	method: 'post',
	middlewares: ['auth', 'admin']
};

type incomingSettings = {
	key: string;
	type: string;
	value: string;
};

export const run = async (req: RequestWithUser, res: FastifyReply) => {
	const { settings }: { settings: string } = req.body as { settings: string };

	try {
		// TODO: Validation of the settings
		const parsedSettings: Partial<typeof SETTINGS> = {};
		for (const item of settings as unknown as incomingSettings[]) {
			if (item.type === 'boolean') parsedSettings[item.key] = item.value === 'true';
			else if (item.type === 'number') parsedSettings[item.key] = Number(item.value);
			else parsedSettings[item.key] = item.value;
		}

		// @ts-expect-error chunkSize is a string on the db, but int here.
		parsedSettings.chunkSize = String(parsedSettings.chunkSize);
		// @ts-expect-error maxSize is a string on the db, but int here.
		parsedSettings.maxSize = String(parsedSettings.maxSize);
		// @ts-expect-error maxSize is a string on the db, but int here.
		parsedSettings.usersStorageQuota = String(parsedSettings.usersStorageQuota);

		await prisma.settings.update({
			where: {
				id: 1
			},
			// @ts-ignore
			data: {
				...parsedSettings
			}
		});

		await res.send({ message: 'Settings updated' });
		// Refresh the instance settings
		await loadSettings(true);
		// If running in production, we need to update the html buffer
		if (process.env.NODE_ENV === 'production') await getHtmlBuffer();

		// Option is enabled, but the schedule is not running
		if (!parsedSettings.disableUpdateCheck && !updateCheck.active) {
			await startUpdateCheckSchedule();
			// Option is disabled, but the schedule is running
		} else if (parsedSettings.disableUpdateCheck && updateCheck.active) {
			stopUpdateCheckSchedule();
		}
	} catch (error) {
		req.log.error(error);
		res.internalServerError(error as string);
	}
};
