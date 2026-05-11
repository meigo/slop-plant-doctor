import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadDiagnosis } from '$lib/storage';
import { ID_REGEX } from '$lib/id';

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) throw error(500, 'Platform unavailable');

  if (!ID_REGEX.test(params.id)) {
    throw error(404, 'Not found');
  }

  const stored = await loadDiagnosis(platform.env.DIAGNOSES, params.id);
  if (!stored) {
    throw error(404, 'Not found');
  }

  return {
    id: params.id,
    result: stored.result,
    createdAt: stored.createdAt
  };
};
