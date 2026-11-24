"""The search goal follows a training-likelihood information criterion when it is the ranking metric."""
from sr_harness.agents.sr_agent import SRAgent


def test_default_metrics_keep_the_validation_goal():
    for metric in (None, "mse", "gaussian_nll", "poisson_deviance"):
        goal = SRAgent._build_mse_goal([], metric)
        assert "use validation for model selection" in goal
        assert "information criterion" not in goal
    assert SRAgent._build_mse_goal([]) == SRAgent._build_mse_goal([], "mse")


def test_bic_ranking_selects_by_the_criterion():
    goal = SRAgent._build_mse_goal([], "selection_bic")
    assert "ranked by selection_bic" in goal
    assert "first submission" in goal
    assert "differences below 2 as ties" in goal
