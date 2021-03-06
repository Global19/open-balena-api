import type { RequestHandler } from 'express';

import { sbvrUtils } from '@balena/pinejs';

import { captureException, handleHttpErrors } from '../../infra/error-handling';
import { UserHasPublicKey } from '../../balena-model';

export const getUserPublicKeys: RequestHandler = async (req, res) => {
	const { username } = req.params;

	if (username == null) {
		return res.sendStatus(400);
	}
	try {
		const data = (await sbvrUtils.api.resin.get({
			resource: 'user__has__public_key',
			options: {
				$select: 'public_key',
				$filter: {
					user: {
						$any: {
							$alias: 'u',
							$expr: {
								u: { username },
							},
						},
					},
				},
			},
			passthrough: { req },
		})) as Array<Pick<UserHasPublicKey, 'public_key'>>;

		const authorizedKeys = data.map((e) => e.public_key).join('\n');
		res.status(200).send(authorizedKeys);
	} catch (err) {
		if (handleHttpErrors(req, res, err)) {
			return;
		}
		captureException(err, 'Error getting public keys', { req });
		res.sendStatus(500);
	}
};
