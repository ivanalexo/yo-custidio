from ape import networks, accounts, project


def main():
    provider_name = networks.provider.name
    if provider_name == "foundry":
        deployer = accounts.test_accounts[0]
    else:
        deployer = accounts.load("yo-custodio-deployer")

    project.ballot.deploy(sender=deployer)
