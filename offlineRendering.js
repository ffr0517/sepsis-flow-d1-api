// file containing quick edits for Ersi to check rendering of changes offline on Five Server via VS Code

// PUT UNDERNEAT THE FIRST BLOCK OF ONE-LINE CONST FILES:
const MOCK_DAY1_ENVELOPE = {
    data: {
      day1_result: [
        {
          level: "Mechanical ventilation, inotropes, or renal replacement therapy",
          mean_predicted_probability: 0.9574,
          p_adj: 0.3174,
          t_adj: 0.5,
          prevalence: 0.05,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 7,
          votes_above_threshold: 0.0583,
          predicted_treatment_by_majority_vote: true
        },
        {
          level: "CPAP or IV fluid bolus",
          mean_predicted_probability: 0.2037,
          p_adj: 0.2037,
          t_adj: 0.5,
          prevalence: 0.02,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 1,
          votes_above_threshold: 0.0083,
          predicted_treatment_by_majority_vote: false
        },
        {
          level: "ICU admission with clinical reason",
          mean_predicted_probability: 0.01,
          p_adj: 0.1505,
          t_adj: 0.5,
          prevalence: 0.01,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 0,
          votes_above_threshold: 0.0,
          predicted_treatment_by_majority_vote: true
        },
        {
          level: "O2 via face or nasal cannula",
          mean_predicted_probability: 0.1795,
          p_adj: 0.1795,
          t_adj: 0.5,
          prevalence: 0.03,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 0,
          votes_above_threshold: 0.0,
          predicted_treatment_by_majority_vote: false
        },
        {
          level: "Non-bolused IV fluids",
          mean_predicted_probability: 0.5323,
          p_adj: 0.5323,
          t_adj: 0.5,
          prevalence: 0.47,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 77,
          votes_above_threshold: 0.6417,
          predicted_treatment_by_majority_vote: true
        }
      ],

      day2_prefill: {
        LEVEL1_TREATMENTS_D1_SAFE_0: 0,
        LEVEL2_TREATMENTS_D1_SAFE_0: 0,
        LEVEL3_TREATMENTS_D1_SAFE_0: 0,
        LEVEL4_TREATMENTS_D1_SAFE_0: 0,
        LEVEL5_TREATMENTS_D1_SAFE_0: 1
      },
      baseline_inputs: {} // optional
    }
  };
  
  
  const MOCK_DAY2_ENVELOPE = {
    data: {
      day2_result: [
        {
          level: "Mechanical ventilation, inotropes, or renal replacement therapy",
          mean_predicted_probability: 0.0821,
          p_adj: 0.0821,
          t_adj: 0.5,
          prevalence: 0.03,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 2,
          votes_above_threshold: 0.016,
          predicted_treatment_by_majority_vote: true
        },
        {
          level: "CPAP or IV fluid bolus",
          mean_predicted_probability: 0.1420,
          p_adj: 0.1420,
          t_adj: 0.5,
          prevalence: 0.05,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 3,
          votes_above_threshold: 0.028,
          predicted_treatment_by_majority_vote: false
        },
        {
          level: "ICU admission with clinical reason",
          mean_predicted_probability: 0.0985,
          p_adj: 0.0985,
          t_adj: 0.5,
          prevalence: 0.02,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 1,
          votes_above_threshold: 0.01,
          predicted_treatment_by_majority_vote: false
        },
        {
          level: "O2 via face or nasal cannula",
          mean_predicted_probability: 0.2230,
          p_adj: 0.2230,
          t_adj: 0.5,
          prevalence: 0.15,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 5,
          votes_above_threshold: 0.045,
          predicted_treatment_by_majority_vote: false
        },
        {
          level: "Non-bolused IV fluids",
          mean_predicted_probability: 0.4100,
          p_adj: 0.4100,
          t_adj: 0.5,
          prevalence: 0.28,
          prevalence_scope: "overall",
          prevalence_stratum: "",
          votes_exceeding_threshold: 41,
          votes_above_threshold: 0.36,
          predicted_treatment_by_majority_vote: true
        }
      ]
    }
  };



// PUT INSIDE INIT() BEFORE setWarmupUi({...
  state.day1Response = MOCK_DAY1_ENVELOPE;
  state.day2Prefill = MOCK_DAY1_ENVELOPE.data.day2_prefill || {};
  renderDay1Results(MOCK_DAY1_ENVELOPE);
  renderDay2Form(state.day2Prefill);
  showCard("day2EditCard");

  if (!state.day1Response) {
    state.day1Response = MOCK_DAY1_ENVELOPE;
    state.day2Prefill = MOCK_DAY1_ENVELOPE.data.day2_prefill || {};
    renderDay1Results(MOCK_DAY1_ENVELOPE);
    renderDay2Form(state.day2Prefill);
    showCard("day2EditCard");
  }

  state.day2Response = MOCK_DAY2_ENVELOPE;
  renderDay2Results(MOCK_DAY2_ENVELOPE);
  showCard("exportCard");