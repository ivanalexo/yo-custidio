# @version ^0.4.1
# @author Rafael Abuawad <rafael.abuawad@live.com>

# @dev Event for when a ballot is created
event BallotCreated:
    id: uint256
    tableNumber: uint32
    locationId: uint8
    validVotes: uint32
    nullVotes: uint32
    blankVotes: uint32
    partyNames: DynArray[String[32], 8]
    partyVotes: DynArray[String[32], 8]
    createdAt: uint256

# Struct for a ballot
struct Ballot:
    tableNumber: uint32
    locationId: uint8
    validVotes: uint32
    nullVotes: uint32
    blankVotes: uint32
    partyNames: DynArray[String[32], 8]
    partyVotes: DynArray[String[32], 8]
    createdAt: uint256

# Storage variables
ballots: public(HashMap[uint256, Ballot])

# @dev Token ID counter
totalSupply: public(uint256)

# @dev Address of minter, who can mint a token
minter: address

# @dev Name of the smartcontract
name: public(constant(String[12])) = "Yo Custodio"

# @dev Symbol of the smartcontract
symbol: public(constant(String[8])) = "YC-2025"


@deploy
@payable
def __init__():
    """
    @dev Contract constructor.
    """
    self.minter = msg.sender


@external
def mint(
    _tableNumber: uint32,
    _locationId: uint8,
    _validVotes: uint32,
    _nullVotes: uint32,
    _blankVotes: uint32,
    _partyNames: DynArray[String[32], 8],
    _partyVotes: DynArray[String[32], 8],
) -> bool:
    """
    @dev Function to mint tokens
         Throws if `msg.sender` is not the minter.

    @param _tableNumber The table number of the ballot.
    @param _locationId The location id of the ballot.
    @param _validVotes The number of valid votes for the ballot.
    @param _nullVotes The number of null votes for the ballot.
    @param _blankVotes The number of blank votes for the ballot.
    @param _partyNames The names of the parties for the ballot.
    @param _partyVotes The votes for the parties for the ballot.
    @return A boolean that indicates if the operation was successful.
    """
    assert msg.sender == self.minter

    tokenId: uint256 = self.totalSupply
    self.totalSupply += 1

    self._createBallot(tokenId, _tableNumber, _locationId, _validVotes, _nullVotes, _blankVotes, _partyNames, _partyVotes)
    return True


@internal
def _createBallot(
    _tokenId: uint256,
    _tableNumber: uint32,
    _locationId: uint8,
    _validVotes: uint32,
    _nullVotes: uint32,
    _blankVotes: uint32,
    _partyNames: DynArray[String[32], 8],
    _partyVotes: DynArray[String[32], 8],
) -> bool:
    assert self.ballots[_tokenId].createdAt == 0, "Ballot already exists"

    self.ballots[_tokenId] = Ballot(
        tableNumber=_tableNumber,
        locationId=_locationId,
        validVotes=_validVotes,
        nullVotes=_nullVotes,
        blankVotes=_blankVotes,
        partyNames=_partyNames,
        partyVotes=_partyVotes,
        createdAt=block.timestamp,
    )

    log BallotCreated(
        id=_tokenId,
        tableNumber=_tableNumber,
        locationId=_locationId,
        validVotes=_validVotes,
        nullVotes=_nullVotes,
        blankVotes=_blankVotes,
        partyNames=_partyNames,
        partyVotes=_partyVotes,
        createdAt=block.timestamp,
    )
    return True
