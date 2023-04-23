'use strict';

const fs = require('fs');
const authenticate = require('./auth');

/** @param {Context} context */
const action = async (context) => {
	await authenticate(context);

	const endpoint = await getSignedUrl(context);

	context.setProgress('Uploading...');

	await upload(endpoint, context, (progress) => {
		context.setProgress('Uploading...', progress.percent);
	});

	context.setProgress('Getting link...');

	context.copyToClipboard(
		`https://${context.config.get('CLOUD_HOST')}/media/${endpoint.file_id}`
	);

	context.notify('Link to Media has been copied to the clipboard.');
};

/**
 * @param {File} file
 * @param {Context} context
 * @returns {Promise<SignedUrl>}
 */
async function getSignedUrl(context) {
	let domain = context.config.get('CLOUD_HOST');
	let authToken = context.config.get('ACCESS_TOKEN');

	let fileName = encodeURIComponent(sanitizeFilename(context.defaultFileName));

	return context
		.request(`https://${domain}/api/file-uploader/resumeable-upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({
				extension: context.format,
				source: 'web',
				title: fileName,
			}),
		})
		.then((response) => JSON.parse(response.body));
}

/**
 * @param {SignedUrl} endpoint
 * @param {Context} context
 * @param {(event: Progress) => void} onProgress
 */
async function upload(endpoint, context, onProgress) {
	let filePath = await context.filePath({ filetype: context.format });
	let size = fs.statSync(filePath).size;

	await context
		.request(endpoint.signed_url, {
			method: 'POST',
			headers: {
				'content-length': size.toString(),
			},
			body: fs.createReadStream(filePath),
		})
		.on('uploadProgress', onProgress);
}

/**
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
	let sanitized = filename.replace(/[\/:*?"<>|]/g, '_');
	let trimmed = sanitized.replace(/(^\.+|\.+$|\s+)/g, '');
	let limited = trimmed.substring(0, 255);

	return limited;
}

const config = {
	CLOUD_HOST: {
		title: 'Cloud Host',
		type: 'string',
		required: true,
		default: 'cloud.videocom.com',
	},
};

const videocom = {
	title: 'Share to VideoCom',
	configDescription:
		'to sign out, delete the the file "~/Library/Application Support/kap-videocom.json"',
	formats: ['mp4'],
	action,
	config,
};

exports.shareServices = [videocom];

/**
 * @typedef {{
 * 	get: (key: string) => unknown;
 * 	set: (key: string, value: any) => void;
 *  has: (key: string) => boolean;
 * }} Store
 */

/** @typedef {'mp4'} FileType */

/**
 * @template T
 * @typedef {(
 * 	url: string,
 * 	options?: any
 * ) => Promise<any> & { data: any; json: () => Promise<T> }} Got
 */

/**
 * @typedef {{
 * 	format: FileType;
 * 	defaultFileName: string;
 * 	filePath: (arg: { filetype: FileType }) => Promise<string>;
 * 	config: Store;
 * 	request: Got<T>;
 * 	copyToClipboard: (text: string) => void;
 * 	notify: (text: string, action?: () => void) => void;
 * 	setProgress: (text: string, percentage: number) => void;
 * 	openConfigFile: () => void;
 * 	cancel: () => void;
 * 	waitForDeepLink: () => Promise<unknown>;
 * }} Context
 */

/**
 * @typedef {{
 * 	signed_url: string;
 * 	file_id: string;
 * 	thumbnail_signed_url?: string;
 * 	specs_signed_url?: string;
 * }} SignedUrl
 */

/** @typedef {{ handshake_id: string } | Auth} AuthWSMessage */

/**
 * @typedef {{
 * 	type: 'auth';
 * 	session_id: string;
 * 	refresh_token: string;
 * 	jwt: string;
 * 	cookie: string;
 * }} Auth
 */

/** @typedef {{ percent: number; transferred: number; total?: number }} Progress */
