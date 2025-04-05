import pytest


@pytest.fixture(scope="module")
def sender(accounts):
    return accounts[0]


@pytest.fixture(scope="module")
def ballot(project, sender):
    return project.ballot.deploy(sender=sender)


@pytest.fixture(scope="module")
def user(accounts):
    return accounts[1]
