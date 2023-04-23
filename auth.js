const WebSocket = require('ws');
const fs = require('fs');
const { shell } = require('electron');

/** @param {import('./index.js').Context} context */
async function authenticate(context) {
	/** @type {string} */
	let authToken = context.config.get('ACCESS_TOKEN');
	/** @type {string} */
	let refreshToken = context.config.get('REFRESH_TOKEN');
	/** @type {number} */
	let expiryDate = context.config.get('TOKEN_EXPIRY_DATE');

	if (
		context.config.has('REFRESH_TOKEN') &&
		context.config.has('TOKEN_EXPIRY_DATE') &&
		isExpired(expiryDate)
	) {
		// token is expired. re-auth using refresh token

		/**
		 * @type {{
		 * 	refresh_token: string;
		 * 	expires_at: number;
		 * 	success: boolean;
		 * }}
		 */
		let updatedRefreshTokenData = await context
			.request(`https://${domain}/api/auth/refresh-extend`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					refresh_token: refreshToken,
				}),
			})
			.then((response) => JSON.parse(response.body));

		// note questionable api design desision: why separate refresh-extend and refresh api? IDK
		/** @type {{ jwt: string; expires_at: number; success: boolean }} */
		let jwtData = await context
			.request(`https://${domain}/api/auth/refresh`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					refresh_token: updatedRefreshTokenData.refresh_token,
				}),
			})
			.then((response) => JSON.parse(response.body));

		// write the new token config values
		context.config.set('ACCESS_TOKEN', jwtData.jwt);
		context.config.set('REFRESH_TOKEN', updatedRefreshTokenData.refresh_token);
		context.config.set('TOKEN_EXPIRY_DATE', updatedRefreshTokenData.expires_at);

		// end
		return;
	}

	// existing auth exists and is valid, just proceed operations
	if (context.config.has('ACCESS_TOKEN') && authToken.trim() !== '') {
		return;
	}

	// sign-in to an account
	let auth = await new Promise((resolve, reject) => {
		let domain = context.config.get('CLOUD_HOST');

		let socket = new WebSocket(`wss://${domain}/api/realtime/auth-handshake`);

		socket.on('open', () => {
			context.setProgress('Socket Connection established...');
		});

		socket.on('message', (data) => {
			try {
				// Write the JSON data to a file named 'output.json' in the specified directory

				/** @type {AuthWSMessage} */
				let message = JSON.parse(data.toString('utf-8'));

				if (message?.handshake_id) {
					context.setProgress('Opening Browser for authentication...');

					shell.openExternal(
						`https://${domain}/auth?referrer=vpt&handshake_code=${message?.handshake_id}`
					);
					return;
				}

				fs.writeFileSync(
					'/Users/cyrus/Projects/kap-videocom/output.json',
					JSON.stringify(message, null, 2)
				);

				if (message?.type === 'auth') {
					resolve(message);
					socket.close();
				}
			} catch (e) {
				reject(e);
			}
		});

		socket.on('error', (error) => reject(error));
	});

	context.setProgress('Authentication Successful!');

	context.config.set('ACCESS_TOKEN', auth.jwt);
	context.config.set('REFRESH_TOKEN', auth.refresh_token);

	const expires = new Date();
	context.config.set(
		'TOKEN_EXPIRY_DATE',
		expires.getTime() + 30 * 24 * 60 * 60 * 1000
	); // 30 days
}

/**
 * @param {number} timeInMs
 * @returns {boolean}
 */
function isExpired(timeInMs) {
	return new Date(timeInMs).getTime() <= Date.now();
}

module.exports = authenticate;
