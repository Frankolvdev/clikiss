import 'server-only';
import {database} from './db';
import {registrationSettings} from '../shared/registration-settings.mjs';

export async function emailVerificationRequired(){return (await registrationSettings(database())).requireEmailVerification;}
