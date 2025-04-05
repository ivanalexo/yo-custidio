import pytest
import ape


def test_name(ballot):
    assert ballot.name() == "Yo Custodio"


def test_symbol(ballot):
    assert ballot.symbol() == "YC-2025"


def test_mint_ballot(ballot, sender):
    # Test data
    table_number = 123
    location_id = 5
    valid_votes = 100
    null_votes = 10
    blank_votes = 5
    party_names = ["Party A", "Party B", "Party C"]
    party_votes = ["50", "30", "20"]

    # Mint ballot
    tx = ballot.mint(
        table_number,
        location_id,
        valid_votes,
        null_votes,
        blank_votes,
        party_names,
        party_votes,
        sender=sender,
    )

    # Test ballot data
    ballot_data = ballot.ballots(0)
    assert ballot_data[0] == table_number  # tableNumber
    assert ballot_data[1] == location_id  # locationId
    assert ballot_data[2] == valid_votes  # validVotes
    assert ballot_data[3] == null_votes  # nullVotes
    assert ballot_data[4] == blank_votes  # blankVotes
    assert ballot_data[5] == party_names  # partyNames
    assert ballot_data[6] == party_votes  # partyVotes
    assert ballot_data[7] > 0  # createdAt

    # Test counter increment
    assert ballot.totalSupply() == 1


def test_mint_permissions(ballot, sender, user):
    table_number = 123
    location_id = 5
    valid_votes = 100
    null_votes = 10
    blank_votes = 5
    party_names = ["Party A", "Party B"]
    party_votes = ["60", "40"]

    # Test non-minter cannot mint
    with ape.reverts():
        ballot.mint(
            table_number,
            location_id,
            valid_votes,
            null_votes,
            blank_votes,
            party_names,
            party_votes,
            sender=user,
        )


def test_multiple_ballots(ballot, sender):
    # Create multiple ballots and verify they're stored correctly
    for i in range(3):
        ballot.mint(
            100 + i,
            i + 1,
            100,
            10,
            5,
            [f"Party {j}" for j in range(2)],
            [str(50 - i), str(50 + i)],
            sender=sender,
        )

    # Verify all ballots
    assert ballot.totalSupply() == 3

    for i in range(3):
        ballot_data = ballot.ballots(i)
        assert ballot_data[0] == 100 + i  # tableNumber
        assert ballot_data[1] == i + 1  # locationId


def test_ballot_validation(ballot, sender, user):
    # Test valid votes sum matches party votes
    table_id = 123
    location_id = 5
    valid_votes = 100
    null_votes = 10
    blank_votes = 5
    party_names = ["Party A", "Party B"]
    party_votes = ["60", "40"]

    ballot.mint(
        table_id,
        location_id,
        valid_votes,
        null_votes,
        blank_votes,
        party_names,
        party_votes,
        sender=sender,
    )

    ballot_data = ballot.ballots(0)
    party_votes_sum = sum(int(v) for v in ballot_data[6])
    assert party_votes_sum == valid_votes


def test_party_data_limits(ballot, sender, user):
    # Test maximum party limit (8)
    max_parties = ["Party " + str(i) for i in range(8)]
    max_votes = ["10" for _ in range(8)]

    # Should succeed with 8 parties
    ballot.mint(123, 5, 80, 10, 5, max_parties, max_votes, sender=sender)

    # Should fail with more than 8 parties
    too_many_parties = ["Party " + str(i) for i in range(9)]
    too_many_votes = ["10" for _ in range(9)]

    with ape.reverts():
        ballot.mint(
            123,
            5,
            90,
            10,
            5,
            too_many_parties,
            too_many_votes,
            sender=sender,
        )
