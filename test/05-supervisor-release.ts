import { expect } from './test-lib/chai';
import * as fixtures from './test-lib/fixtures';
import { supertest, UserObjectParam } from './test-lib/supertest';

import { app } from '../init';

import * as fakeDevice from './test-lib/fake-device';

describe('supervisor release', function () {
	let admin: UserObjectParam;

	before(async () => {
		const fx = await fixtures.load();
		admin = fx.users.admin;
	});

	it('should allow admins to create supervisor releases', async () => {
		const res = await supertest(app)
			.get(`/resin/device_type?$select=id&$filter=slug eq 'raspberry-pi'`)
			.expect(200);

		expect(res.body).to.have.nested.property('d[0].id').that.is.a('number');

		await supertest(app, admin)
			.post(`/resin/supervisor_release`)
			.send({
				image_name: 'SOME_IMAGE',
				supervisor_version: '1.2.3',
				is_for__device_type: res.body.d[0].id,
			})
			.expect(201);
	});

	let supervisorReleaseId: number;

	it('should allow admins to read the supervisor release', async () => {
		const res = await supertest(app, admin)
			.get(
				'/resin/supervisor_release?$select=id,image_name,supervisor_version,is_for__device_type',
			)
			.expect(200);
		expect(res.body).to.have.nested.property('d.length', 3);
		expect(res.body.d[0]).to.have.nested.property('image_name');
		expect(res.body.d[0]).to.have.nested.property('supervisor_version');
		expect(res.body.d[0]).to.have.nested.property('is_for__device_type');
		supervisorReleaseId = res.body.d[0].id;
	});

	it('should allow admins to delete the supervisor releases', async () => {
		await supertest(app, admin)
			.delete(`/resin/supervisor_release(${supervisorReleaseId})`)
			.expect(200);
	});

	describe('Devices running supervisor releases', () => {
		let applicationId: number;
		let device: fakeDevice.Device;
		let device2: fakeDevice.Device;
		let fx: fixtures.Fixtures;
		let supervisorReleases: Dictionary<{ id: number }>;

		before(async () => {
			fx = await fixtures.load('05-supervisor-release');
			admin = fx.users.admin;
			applicationId = fx.applications.app1.id;

			device = await fakeDevice.provisionDevice(admin, applicationId);
			device2 = await fakeDevice.provisionDevice(admin, applicationId);
			supervisorReleases = fx['supervisor-release'];
		});

		after(async () => {
			await fixtures.clean(fx);
		});

		it('should be provisioned with a non-null supervisor release after device PATCH', async () => {
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					os_version: '2.38.0+rev1',
					supervisor_version: '5.0.1',
				})
				.expect(200);

			const res = await supertest(app, admin).get(
				`/resin/device(${device.id})?$expand=should_be_managed_by__supervisor_release`,
			);
			expect(res.body)
				.to.have.nested.property(
					'd[0].should_be_managed_by__supervisor_release[0].supervisor_version',
				)
				.that.equals(`v${res.body.d[0].supervisor_version}`);
		});

		it('should be set to a non-null supervisor release after state endpoint PATCH', async () => {
			await device2.patchStateV2({
				local: {
					api_port: 48484,
					api_secret: 'somesecret',
					os_version: '2.38.0+rev1',
					os_variant: 'dev',
					supervisor_version: '5.0.1',
					provisioning_progress: null,
					provisioning_state: '',
					status: 'Idle',
					logs_channel: null,
					update_failed: false,
					update_pending: false,
					update_downloaded: false,
				},
			});

			const res = await supertest(app, admin).get(
				`/resin/device(${device2.id})?$expand=should_be_managed_by__supervisor_release`,
			);
			expect(res.body)
				.to.have.nested.property(
					'd[0].should_be_managed_by__supervisor_release[0].supervisor_version',
				)
				.that.equals(`v${res.body.d[0].supervisor_version}`);
		});

		it('should allow upgrading to a logstream version', async () => {
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					should_be_managed_by__supervisor_release:
						supervisorReleases['6.0.1_logstream'].id,
				})
				.expect(200);
		});

		it("should allow upgrading a device's supervisor release", async () => {
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					should_be_managed_by__supervisor_release:
						supervisorReleases['7.0.1'].id,
				})
				.expect(200);
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					should_be_managed_by__supervisor_release:
						supervisorReleases['8.0.1'].id,
				})
				.expect(200);
		});

		it('should not allow downgrading a supervisor version', async () => {
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					should_be_managed_by__supervisor_release:
						supervisorReleases['7.0.1'].id,
				})
				.expect(400);
		});

		it('should correctly determine logstream values', async () => {
			await supertest(app, admin)
				.patch(`/resin/device(${device.id})`)
				.send({
					should_be_managed_by__supervisor_release:
						supervisorReleases['6.0.1_logstream'].id,
				})
				.expect(400);
		});
	});
});
