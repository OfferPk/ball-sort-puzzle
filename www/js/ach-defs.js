/* Game-specific achievements (cosmetic coin rewards). Shared ones live in achievements.js. */
window.ACH_DEFS = [
  { "id": "bs_first", "name": "First Pour", "desc": "Solve your first level", "metric": "wins", "goal": 1, "reward": 15 },
  { "id": "bs_wins25", "name": "Tube Tamer", "desc": "Solve 25 levels", "metric": "wins", "goal": 25, "reward": 80 },
  { "id": "bs_wins100", "name": "Sorting Sage", "desc": "Solve 100 levels", "metric": "wins", "goal": 100, "reward": 200 },
  { "id": "bs_star3", "name": "Perfectionist", "desc": "Earn 3 stars on 10 levels", "metric": "stars3", "goal": 10, "reward": 70 },
  { "id": "bs_clean", "name": "Steady Hand", "desc": "Solve 10 levels without Undo or +1 Tube", "metric": "clean_wins", "goal": 10, "reward": 70 },
  { "id": "bs_lvl20", "name": "Climber", "desc": "Reach level 20", "metric": "best_level", "goal": 20, "reward": 60 },
  { "id": "bs_lvl50", "name": "Summit", "desc": "Reach level 50", "metric": "best_level", "goal": 50, "reward": 150 },
  { "id": "bs_pour500", "name": "Busy Pourer", "desc": "Make 500 pours", "metric": "moves", "goal": 500, "reward": 60 }
];
