import { http, HttpResponse } from 'msw';

const TAUTULLI_URL = 'http://localhost:8181';

export const tautulliHandlers = [
  http.get(`${TAUTULLI_URL}/api/v2`, ({ request }) => {
    const url = new URL(request.url);
    const cmd = url.searchParams.get('cmd');

    if (cmd === 'get_libraries_table') {
      return HttpResponse.json({
        response: {
          result: 'success',
          data: {
            data: [
              { section_id: 1, section_name: 'Movies', section_type: 'movie', count: 100 },
              { section_id: 2, section_name: 'TV Shows', section_type: 'show', count: 50 },
            ],
          },
        },
      });
    }

    if (cmd === 'get_home_stats') {
      return HttpResponse.json({
        response: {
          result: 'success',
          data: [{ stat_id: 'top_movies', rows: [{ title: 'The Matrix', total_plays: 10 }] }],
        },
      });
    }

    // Shapes as a live Tautulli v2 server sends them: keys are numbers, the play's times are
    // `date`/`started`/`stopped` in Unix seconds, and a grouped row merges several sessions.
    if (cmd === 'get_history') {
      return HttpResponse.json({
        response: {
          result: 'success',
          data: {
            recordsFiltered: 2,
            recordsTotal: 2,
            data: [
              {
                row_id: 41,
                group_count: 2,
                group_ids: '40,41',
                rating_key: 123,
                grandparent_rating_key: '',
                media_type: 'movie',
                title: 'The Matrix',
                user: 'testuser',
                watched_status: 1,
                duration: 7380,
                play_duration: 7380,
                date: 1700000000,
                started: 1700000000,
                stopped: 1700007380,
              },
              {
                row_id: 42,
                group_count: 1,
                group_ids: '42',
                rating_key: 456,
                grandparent_rating_key: 789,
                media_type: 'episode',
                title: 'Pilot',
                user: 'testuser',
                watched_status: 0.5,
                duration: 1200,
                play_duration: 600,
                date: 1700100000,
                started: 1700100000,
                stopped: 1700100600,
              },
            ],
          },
        },
      });
    }

    return HttpResponse.json(
      { response: { result: 'error', message: 'Unknown command' } },
      { status: 400 }
    );
  }),
];
